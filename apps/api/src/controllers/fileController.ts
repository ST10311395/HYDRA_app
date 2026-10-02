import type { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { FILE_PURPOSES, idParam } from '@hydra/shared';
import { integrations } from '../integrations';
import { LocalDiskStorage } from '../integrations/storage';
import { actorFrom, auth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimits';
import { defineRoute } from '../routes/define';
import { getFileForUser, MAX_UPLOAD_BYTES, uploadFile } from '../services/fileService';
import { badRequest, notFound } from '../utils/errors';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
});

export function registerFileRoutes(r: Router): void {
  defineRoute(r, { method: 'post', path: '/files', tag: 'Files', summary: 'Upload a job photo, inspection evidence, compliance document or profile image (multipart field "file")', access: 'authenticated',
    pre: [uploadLimiter, upload.single('file')], status: 201 },
    (req) => {
      const purpose = z.enum(FILE_PURPOSES).safeParse(req.body?.purpose);
      if (!purpose.success) throw badRequest('purpose must be one of JOB_PHOTO, INSPECTION_EVIDENCE, COMPLIANCE_DOCUMENT, PROFILE_IMAGE');
      if (!req.file) throw badRequest('Attach a file in the "file" field');
      return uploadFile(auth(req), purpose.data, req.file, actorFrom(req));
    });

  defineRoute(r, { method: 'get', path: '/files/:id', tag: 'Files', summary: 'Get a fresh time-limited URL for a file you may access', access: 'authenticated', params: idParam },
    (req, { params }) => getFileForUser(auth(req), params.id));

  // Local development storage only: serves objects behind an HMAC-signed, expiring URL.
  defineRoute(r, { method: 'get', path: '/files/raw/*key', tag: 'Files', summary: 'Signed local file download (development storage)', access: 'public', raw: true,
    query: z.object({ exp: z.coerce.number().int(), sig: z.string().regex(/^[a-f0-9]{64}$/) }) },
    async (req, { query }, res) => {
      const storage = integrations().storage;
      const keyParam = (req.params as Record<string, string | string[]>).key;
      const key = Array.isArray(keyParam) ? keyParam.join('/') : String(keyParam ?? '');
      if (!(storage instanceof LocalDiskStorage) || !storage.verify(key, query.exp, query.sig)) throw notFound('File');
      const data = await storage.get(key).catch(() => {
        throw notFound('File');
      });
      const ext = key.split('.').pop();
      const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' };
      res.setHeader('Content-Type', types[ext ?? ''] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(data);
    });
}
