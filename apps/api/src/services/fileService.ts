import { randomUUID } from 'node:crypto';
import type { FileRefDto, FilePurpose } from '@hydra/shared';
import { db, type Queryable } from '../db/pool';
import { integrations } from '../integrations';
import { PostgresFileRepository, type FileRow } from '../repositories/fileRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import type { AuthContext } from '../types/express';
import { AppError, badRequest, notFound } from '../utils/errors';
import { canAccessJob, isAdminRole } from './accessControl';
import { audit, type Actor } from './auditService';

export const SIGNED_URL_TTL_SECONDS = 15 * 60;

type Detected = { mime: string; ext: string } | null;

/** Magic-byte sniffing — never trust the client-declared MIME type or file extension alone. */
export function sniffMime(buf: Buffer): Detected {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heis'].includes(brand)) return { mime: 'image/heic', ext: 'heic' };
  }
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

const RULES: Record<FilePurpose, { mimes: string[]; maxBytes: number }> = {
  JOB_PHOTO: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 8 * 1024 * 1024 },
  INSPECTION_EVIDENCE: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 8 * 1024 * 1024 },
  PROFILE_IMAGE: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 4 * 1024 * 1024 },
  COMPLIANCE_DOCUMENT: { mimes: ['application/pdf', 'image/jpeg', 'image/png'], maxBytes: 15 * 1024 * 1024 },
  /** HYDRA Smart Quote photos: private, owner/admin only until linked to an assigned job. */
  AI_ASSESSMENT_PHOTO: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 8 * 1024 * 1024 },
};

const EXT_OK = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function uploadFile(
  auth: AuthContext,
  purpose: FilePurpose,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  actor: Actor,
): Promise<FileRefDto> {
  const rule = RULES[purpose];
  if (auth.role === 'CUSTOMER' && purpose !== 'JOB_PHOTO' && purpose !== 'PROFILE_IMAGE' && purpose !== 'AI_ASSESSMENT_PHOTO') {
    throw new AppError(403, 'FORBIDDEN', 'Customers may only upload job photos');
  }
  if (auth.role !== 'CUSTOMER' && purpose === 'AI_ASSESSMENT_PHOTO') {
    throw new AppError(403, 'FORBIDDEN', 'Smart Quote photos are uploaded by customers');
  }
  if (file.size <= 0) throw badRequest('The file is empty');
  if (file.size > rule.maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `File exceeds the ${Math.round(rule.maxBytes / 1048576)}MB limit`);
  if (!EXT_OK.test(file.originalname)) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Unsupported file extension');
  const detected = sniffMime(file.buffer);
  if (!detected || !rule.mimes.includes(detected.mime)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'File content does not match an allowed type for this upload');
  }
  const declaredFamily = file.mimetype.split('/')[0];
  if (declaredFamily !== detected.mime.split('/')[0] && file.mimetype !== 'application/octet-stream') {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Declared file type does not match its content');
  }
  const now = new Date();
  // Random server-side object key: user-supplied names never influence the storage path.
  const key = `${purpose.toLowerCase().replace(/_/g, '-')}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${detected.ext}`;
  await integrations().storage.put(key, file.buffer, detected.mime);
  const safeName = file.originalname.replace(/[^\w.\- ]/g, '_').slice(-120) || `upload.${detected.ext}`;
  const row = await new PostgresFileRepository(db()).insert({
    storageKey: key,
    originalName: safeName,
    mimeType: detected.mime,
    sizeBytes: file.size,
    purpose,
    ownerUserId: auth.userId,
  });
  await audit(db(), actor, 'FILE_UPLOADED', 'file', row.id, { purpose, mime: detected.mime, size: file.size });
  return toFileRef(row);
}

export async function toFileRef(row: FileRow): Promise<FileRefDto> {
  return {
    id: row.id,
    fileName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    purpose: row.purpose,
    createdAt: new Date(row.createdAt).toISOString(),
    url: await integrations().storage.signedUrl(row.storageKey, SIGNED_URL_TTL_SECONDS, row.originalName),
  };
}

export async function fileRefs(q: Queryable, ids: string[]): Promise<FileRefDto[]> {
  const rows = await new PostgresFileRepository(q).findMany(ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return Promise.all(ids.map((id) => byId.get(id)).filter((r): r is FileRow => !!r).map(toFileRef));
}

/**
 * Validates that files referenced in a request were uploaded by the caller, are not yet attached
 * elsewhere, and have an allowed purpose. Prevents attaching another user's upload by ID.
 */
export async function assertOwnUnattachedFiles(q: Queryable, auth: AuthContext, ids: string[], purposes: FilePurpose[]): Promise<void> {
  if (!ids.length) return;
  const rows = await new PostgresFileRepository(q).findMany(ids);
  if (rows.length !== new Set(ids).size) throw badRequest('One or more attachments were not found');
  for (const r of rows) {
    if (r.ownerUserId !== auth.userId || r.attached || !purposes.includes(r.purpose)) {
      throw badRequest('One or more attachments cannot be used here');
    }
  }
}

export async function getFileForUser(auth: AuthContext, fileId: string): Promise<FileRefDto> {
  const files = new PostgresFileRepository(db());
  const row = await files.findById(fileId);
  if (!row) throw notFound('File');
  if (row.ownerUserId === auth.userId || isAdminRole(auth)) return toFileRef(row);
  const links = await files.linkedJobIds(fileId);
  const jobs = new PostgresJobRepository(db());
  for (const link of links) {
    const job = await jobs.findById(link.jobId);
    if (job && canAccessJob(auth, job)) return toFileRef(row);
  }
  throw notFound('File');
}
