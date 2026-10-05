/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { FilePurpose } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export interface FileRow {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  purpose: FilePurpose;
  ownerUserId: string;
  attached: boolean;
  createdAt: Date;
}

const COLS = `id, storage_key AS "storageKey", original_name AS "originalName", mime_type AS "mimeType", size_bytes AS "sizeBytes",
  purpose, owner_user_id AS "ownerUserId", attached, created_at AS "createdAt"`;

export interface IFileRepository {
  insert(f: Omit<FileRow, 'id' | 'attached' | 'createdAt'>): Promise<FileRow>;
  findById(id: string): Promise<FileRow | null>;
  findMany(ids: string[]): Promise<FileRow[]>;
  markAttached(ids: string[]): Promise<void>;
  /** Job id(s) a file is linked to (job attachment, inspection evidence or compliance document). */
  linkedJobIds(fileId: string): Promise<{ jobId: string; viaInspection: boolean }[]>;
  orphans(olderThanHours: number): Promise<FileRow[]>;
  delete(id: string): Promise<void>;
}

export class PostgresFileRepository implements IFileRepository {
  constructor(private readonly db: Queryable) {}

  async insert(f: Omit<FileRow, 'id' | 'attached' | 'createdAt'>) {
    const { rows } = await this.db.query<FileRow>(
      `INSERT INTO files (storage_key, original_name, mime_type, size_bytes, purpose, owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
      [f.storageKey, f.originalName, f.mimeType, f.sizeBytes, f.purpose, f.ownerUserId],
    );
    return rows[0]!;
  }

  async findById(id: string) {
    const { rows } = await this.db.query<FileRow>(`SELECT ${COLS} FROM files WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findMany(ids: string[]) {
    if (!ids.length) return [];
    const { rows } = await this.db.query<FileRow>(`SELECT ${COLS} FROM files WHERE id = ANY($1::uuid[])`, [ids]);
    return rows;
  }

  async markAttached(ids: string[]) {
    if (ids.length) await this.db.query('UPDATE files SET attached = true WHERE id = ANY($1::uuid[])', [ids]);
  }

  async linkedJobIds(fileId: string) {
    const { rows } = await this.db.query<{ jobId: string; viaInspection: boolean }>(
      `SELECT job_id AS "jobId", false AS "viaInspection" FROM job_attachments WHERE file_id = $1
       UNION ALL
       SELECT ir.job_id, true FROM inspection_attachments ia JOIN inspection_reports ir ON ir.id = ia.report_id WHERE ia.file_id = $1
       UNION ALL
       SELECT job_id, true FROM inspection_reports WHERE document_file_id = $1`,
      [fileId],
    );
    return rows;
  }

  async orphans(olderThanHours: number) {
    const { rows } = await this.db.query<FileRow>(
      `SELECT ${COLS} FROM files WHERE attached = false AND purpose <> 'PROFILE_IMAGE'
          AND created_at < now() - make_interval(hours => $1) LIMIT 500`,
      [olderThanHours],
    );
    return rows;
  }

  async delete(id: string) {
    await this.db.query('DELETE FROM files WHERE id = $1 AND attached = false', [id]);
  }
}
