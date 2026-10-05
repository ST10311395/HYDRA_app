/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Realtime hub abstraction. The HTTP server wires Socket.IO in; scripts/tests run without it.
 * Rooms: `user:<userId>`, `admins`, `job:<jobId>`.
 */
export type RealtimeEvent =
  | 'job.updated'
  | 'job.milestone'
  | 'job.checkin'
  | 'quote.ready'
  | 'invoice.updated'
  | 'payment.confirmed'
  | 'notification.new'
  | 'schedule.updated'
  | 'inventory.low_stock'
  | 'ai.updated';

export interface RealtimeHub {
  emit(room: string, event: RealtimeEvent, payload: Record<string, unknown>): void;
}

let hub: RealtimeHub = { emit: () => undefined };

export function setRealtimeHub(next: RealtimeHub): void {
  hub = next;
}

export function realtime(): RealtimeHub {
  return hub;
}
