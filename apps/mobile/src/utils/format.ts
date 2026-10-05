import { JOB_STATUS_LABELS, formatZar, type InvoiceStatus, type JobStatus, type MissedCallStatus } from '@hydra/shared';
import type { IconName } from '../design-system/Icon';

export const money = formatZar;

const TZ = 'Africa/Johannesburg';

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-ZA', { timeZone: TZ, ...opts });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-ZA', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(iso)}`;
}

export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : fmtDate(iso);
}

export function monthYear(iso: string): string {
  return fmtDate(iso, { month: 'long', year: 'numeric' });
}

/** Today in the business timezone as YYYY-MM-DD. */
export function todayIso(): string {
  return new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** SAST wall-clock time on a date → ISO instant. */
export function sastInstant(dateIso: string, hhmm: string): string {
  return new Date(`${dateIso}T${hhmm}:00+02:00`).toISOString();
}

export const jobStatusLabel = (s: JobStatus) => JOB_STATUS_LABELS[s];

export function jobStatusTone(s: JobStatus): 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'neutral' {
  switch (s) {
    case 'REQUESTED':
      return 'neutral';
    case 'QUOTED':
    case 'INVOICED':
    case 'PARTIALLY_PAID':
      return 'warning';
    case 'QUOTE_ACCEPTED':
    case 'SCHEDULED':
      return 'primary';
    case 'IN_PROGRESS':
    case 'INSPECTION_PENDING':
      return 'secondary';
    case 'COMPLETED':
    case 'PAID':
      return 'success';
    case 'QUOTE_DECLINED':
    case 'CANCELLED':
      return 'danger';
  }
}

export function invoiceTone(s: InvoiceStatus): 'primary' | 'danger' | 'success' | 'warning' | 'neutral' {
  if (s === 'PAID') return 'success';
  if (s === 'OVERDUE') return 'danger';
  if (s === 'PARTIALLY_PAID' || s === 'SENT') return 'warning';
  return 'neutral';
}

export const MISSED_TONE: Record<MissedCallStatus, 'primary' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  NEW: 'primary',
  AUTO_REPLIED: 'success',
  REVIEW_REQUIRED: 'warning',
  REPLIED: 'success',
  DISMISSED: 'neutral',
  FAILED: 'danger',
};

export const SERVICE_ICON: Record<string, IconName> = {
  SOLAR: 'sun',
  CABLING: 'git-merge',
  SUBSTATIONS: 'zap',
  EMERGENCY: 'alert-triangle',
  COMPLIANCE: 'shield',
  AUTOMATION: 'cpu',
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

const TIER_FLOOR: Record<string, number> = { BRONZE: 0, SILVER: 1500, GOLD: 5000, PLATINUM: 10000 };

/** 0..1 progress from the current tier floor to the next tier. */
export function tierProgress(r: { tier: string; nextTier: string | null; lifetimePoints: number }): number {
  if (!r.nextTier) return 1;
  const floor = TIER_FLOOR[r.tier] ?? 0;
  const ceil = TIER_FLOOR[r.nextTier] ?? floor + 1;
  return Math.max(0, Math.min(1, (r.lifetimePoints - floor) / (ceil - floor)));
}
