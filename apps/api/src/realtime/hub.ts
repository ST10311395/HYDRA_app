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
  | 'inventory.low_stock';

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
