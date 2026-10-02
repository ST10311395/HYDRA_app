import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { ADMIN_ROLES } from '@hydra/shared';
import { isAllowedOrigin } from '../config/cors';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { db } from '../db/pool';
import { resolveAuth } from '../middleware/auth';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { canAccessJob } from '../services/accessControl';
import { setRealtimeHub } from './hub';

/**
 * Live updates (spec §19). Sockets authenticate with the same access token as REST; clients are placed
 * in `user:<id>` (and `admins`) rooms and may subscribe to `job:<id>` only after an ownership check.
 */
export function attachRealtime(server: HttpServer): Server {
  const io = new Server(server, {
    path: '/realtime',
    cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin, config())) },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) return next(new Error('unauthorized'));
      socket.data.auth = await resolveAuth(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const a = socket.data.auth as Awaited<ReturnType<typeof resolveAuth>>;
    void socket.join(`user:${a.userId}`);
    if (ADMIN_ROLES.includes(a.role)) void socket.join('admins');

    socket.on('job:subscribe', async (jobId: unknown, ack?: (ok: boolean) => void) => {
      try {
        if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) return ack?.(false);
        const job = await new PostgresJobRepository(db()).findById(jobId);
        if (!job || !canAccessJob(a, job)) return ack?.(false);
        await socket.join(`job:${jobId}`);
        ack?.(true);
      } catch (err) {
        logger.warn({ err }, 'job:subscribe failed');
        ack?.(false);
      }
    });
    socket.on('job:unsubscribe', (jobId: unknown) => {
      if (typeof jobId === 'string') void socket.leave(`job:${jobId}`);
    });
  });

  setRealtimeHub({ emit: (room, event, payload) => io.to(room).emit(event, payload) });
  return io;
}
