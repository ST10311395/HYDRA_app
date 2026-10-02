import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { config } from '../config';
import { useAuth } from '../store/auth';

let socket: Socket | null = null;

/**
 * Live updates (spec §19): server events invalidate the matching React Query caches so timelines,
 * quotes, invoices and schedules refresh without polling.
 */
export function useRealtime(): void {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) return;
    socket = io(config.apiUrl, { path: '/realtime', transports: ['websocket'], auth: { token }, reconnectionDelayMax: 10_000 });
    const invalidate = (...keys: string[][]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    socket.on('job.updated', (p: { jobId?: string }) => invalidate(['jobs'], ['dashboard'], p.jobId ? ['job', p.jobId] : ['job'], ['schedules']));
    socket.on('job.milestone', (p: { jobId?: string }) => invalidate(p.jobId ? ['job', p.jobId] : ['job'], ['dashboard']));
    socket.on('job.checkin', (p: { jobId?: string }) => invalidate(p.jobId ? ['job', p.jobId] : ['job'], ['dashboard'], ['qr']));
    socket.on('quote.ready', () => invalidate(['jobs'], ['dashboard'], ['quote']));
    socket.on('invoice.updated', () => invalidate(['invoices'], ['invoice'], ['dashboard'], ['rewards']));
    socket.on('payment.confirmed', () => invalidate(['invoices'], ['invoice'], ['payment'], ['rewards'], ['dashboard']));
    socket.on('schedule.updated', () => invalidate(['schedules'], ['dashboard'], ['jobs']));
    socket.on('inventory.low_stock', () => invalidate(['materials'], ['dashboard']));
    socket.on('notification.new', () => invalidate(['notifications'], ['dashboard']));
    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, qc]);
}

/** Join a job room for live timeline updates while a job screen is open. */
export function useJobSubscription(jobId: string | undefined): void {
  useEffect(() => {
    if (!jobId || !socket) return;
    socket.emit('job:subscribe', jobId);
    return () => {
      socket?.emit('job:unsubscribe', jobId);
    };
  }, [jobId]);
}
