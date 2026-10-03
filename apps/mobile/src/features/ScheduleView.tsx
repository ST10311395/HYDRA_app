import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ScheduleEventDto } from '@hydra/shared';
import { useSchedule } from '../api/queries';
import { JobStatusBadge } from '../components/jobs';
import { Screen } from '../components/layout';
import { Badge, EmptyState, FilterChips, Icon, Label, Segmented, Text, colors, radius, spacing, type IconName } from '../design-system';
import { addDaysIso, fmtDate, fmtTime, todayIso } from '../utils/format';
import { QueryFallback, notReady } from '../components/QueryState';

type View_ = 'day' | 'week' | 'month';

const TYPE_STYLE: Record<ScheduleEventDto['eventType'], { icon: IconName; tone: 'primary' | 'secondary' | 'warning' | 'neutral'; label: string }> = {
  JOB: { icon: 'briefcase', tone: 'primary', label: 'Job' },
  LEAVE: { icon: 'sun', tone: 'warning', label: 'Leave' },
  TRAINING: { icon: 'book-open', tone: 'secondary', label: 'Training' },
  MEETING: { icon: 'users', tone: 'secondary', label: 'Meeting' },
  OTHER: { icon: 'calendar', tone: 'neutral', label: 'Event' },
};

const sastDate = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3_600_000).toISOString().slice(0, 10);

function range(view: View_, anchor: string): { from: string; to: string } {
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') {
    const d = new Date(`${anchor}T00:00:00Z`);
    const monday = addDaysIso(anchor, -((d.getUTCDay() + 6) % 7));
    return { from: monday, to: addDaysIso(monday, 6) };
  }
  const first = `${anchor.slice(0, 8)}01`;
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from: first, to: addDaysIso(next.toISOString().slice(0, 10), -1) };
}

/**
 * Calendar (PDF Story 3, spec §9.3): day / week / month views of assigned jobs, admin-created events
 * and approved leave. Default is a short look-ahead to keep mobile data use low.
 */
export function ScheduleView({ employeeId, jobRoute, filterable = true, showEmployee = false, onEventPress }: { employeeId?: string; jobRoute: (jobId: string) => string; filterable?: boolean; showEmployee?: boolean; /** Called for non-job events (admin manage/delete). */ onEventPress?: (e: ScheduleEventDto) => void }) {
  const [view, setView] = useState<View_>('week');
  const [anchor, setAnchor] = useState(todayIso());
  const [type, setType] = useState<'ALL' | ScheduleEventDto['eventType']>('ALL');
  const r = range(view, anchor);
  const q = useSchedule({ from: r.from, to: r.to, employeeId });

  const days = useMemo(() => {
    const out: { date: string; events: ScheduleEventDto[] }[] = [];
    for (let d = r.from; d <= r.to; d = addDaysIso(d, 1)) out.push({ date: d, events: [] });
    for (const e of q.data ?? []) {
      if (type !== 'ALL' && e.eventType !== type) continue;
      for (let d = sastDate(e.startAt); d <= sastDate(new Date(new Date(e.endAt).getTime() - 1).toISOString()); d = addDaysIso(d, 1)) {
        out.find((x) => x.date === d)?.events.push(e);
      }
    }
    return out;
  }, [q.data, r.from, r.to, type]);

  const shift = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(addDaysIso(anchor, dir));
    else if (view === 'week') setAnchor(addDaysIso(anchor, 7 * dir));
    else {
      const d = new Date(`${anchor.slice(0, 8)}01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  const visibleDays = view === 'month' ? days.filter((d) => d.events.length) : days;

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Segmented value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Previous" hitSlop={12} onPress={() => shift(-1)}><Icon name="chevron-left" size={22} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Jump to today" onPress={() => setAnchor(todayIso())} style={{ alignItems: 'center' }}>
          <Text variant="title" weight="bold">{view === 'month' ? fmtDate(r.from, { month: 'long', year: 'numeric' }) : r.from === r.to ? fmtDate(r.from, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtDate(r.from, { day: 'numeric', month: 'short' })} – ${fmtDate(r.to, { day: 'numeric', month: 'short' })}`}</Text>
          <Text variant="caption" color="primaryBright">Today</Text>
        </Pressable>
        <Pressable accessibilityLabel="Next" hitSlop={12} onPress={() => shift(1)}><Icon name="chevron-right" size={22} /></Pressable>
      </View>
      {filterable ? (
        <FilterChips value={type} onChange={setType} options={[{ value: 'ALL', label: 'All' }, { value: 'JOB', label: 'Jobs', icon: 'briefcase' }, { value: 'LEAVE', label: 'Leave', icon: 'sun' }, { value: 'TRAINING', label: 'Training', icon: 'book-open' }, { value: 'MEETING', label: 'Meetings', icon: 'users' }]} />
      ) : null}
      {notReady(q) ? <QueryFallback query={q} /> : visibleDays.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing scheduled" message="Assigned jobs and approved leave will appear here." />
      ) : (
        visibleDays.map((d) => (
          <View key={d.date} style={{ gap: spacing.sm }}>
            <Label color={d.date === todayIso() ? 'primaryBright' : 'textMuted'}>{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}{d.date === todayIso() ? ' · Today' : ''}</Label>
            {d.events.length === 0 ? <Text variant="caption" color="textFaint">No bookings</Text> : d.events.map((e) => {
              const t = TYPE_STYLE[e.eventType];
              return (
                <Pressable
                  key={`${d.date}-${e.id}`}
                  accessibilityRole={e.job || (onEventPress && e.eventType !== 'LEAVE') ? 'button' : undefined}
                  disabled={!e.job && (!onEventPress || e.eventType === 'LEAVE')}
                  onPress={() => (e.job ? router.push(jobRoute(e.job.id) as never) : onEventPress?.(e))}
                  style={[styles.event, { borderLeftColor: t.tone === 'primary' ? colors.primary : t.tone === 'warning' ? colors.warning : t.tone === 'secondary' ? colors.secondary : colors.borderStrong }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="mono" color="textSecondary" style={{ fontSize: 12 }}>{e.eventType === 'LEAVE' ? 'All day' : `${fmtTime(e.startAt)} – ${fmtTime(e.endAt)}`}</Text>
                    {e.job ? <JobStatusBadge status={e.job.status} /> : <Badge label={t.label.toUpperCase()} tone={t.tone} icon={t.icon} />}
                  </View>
                  <Text variant="title" weight="bold">{e.title}</Text>
                  {e.job ? <Text variant="caption" color="textMuted" numberOfLines={2}>{e.job.serviceName} · {e.job.siteAddress}</Text> : null}
                  {showEmployee ? <Text variant="caption" color="secondaryBright">{e.employeeName}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  event: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, padding: spacing.md, gap: 4 },
});
