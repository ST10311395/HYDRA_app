import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TimesheetDto } from '@hydra/shared';
import { errorMessage } from '../api/client';
import { useClock } from '../api/queries';
import { Badge, Button, Card, Icon, Label, Text, confirm, spacing, toast } from '../design-system';
import { fmtDate, fmtTime, todayIso } from '../utils/format';

function elapsed(from: string): string {
  const ms = Math.max(0, Date.now() - new Date(from).getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Why the open shift exists, in words — the app never silently clocks anyone in. */
export function shiftOrigin(shift: TimesheetDto, today = todayIso()): { started: string; note: string | null; stale: boolean } {
  const stale = shift.workDate < today;
  const started = stale ? `Started ${fmtDate(shift.clockIn)} at ${fmtTime(shift.clockIn)}` : `Started today at ${fmtTime(shift.clockIn)}`;
  const note = shift.notes?.startsWith('Auto clock-in on QR arrival')
    ? `Started automatically when you checked in to ${shift.jobReference ?? 'a job'} by QR.`
    : null;
  return { started, note, stale };
}

/** Clock in / out (PDF Story 15). Hours are calculated server-side; one open shift at a time. */
export function ShiftCard({ openShift, todayHours }: { openShift: TimesheetDto | null; todayHours: number }) {
  const clock = useClock();
  const qc = useQueryClient();
  const busy = useRef(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!openShift) return;
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [openShift]);

  const act = async (action: 'in' | 'out') => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (action === 'out' && !(await confirm({ title: 'Clock out?', message: 'Your shift will be submitted for office confirmation.', confirmLabel: 'Clock out' }))) return;
      await clock.mutateAsync({ action }).then(
        (t) => toast.success(action === 'in' ? `Clocked in at ${fmtTime(t.clockIn)}` : `Shift submitted: ${t.totalHours ?? 0}h`),
        (e: unknown) => {
          // e.g. a shift was already opened (QR arrival, another device): show the real state.
          toast.error(errorMessage(e));
          void qc.invalidateQueries({ queryKey: ['timesheets'] });
          void qc.invalidateQueries({ queryKey: ['dashboard'] });
        },
      );
    } finally {
      busy.current = false;
    }
  };

  const origin = openShift ? shiftOrigin(openShift) : null;
  return (
    <Card accent={openShift ? (origin?.stale ? 'danger' : 'success') : 'none'} style={{ gap: spacing.md }} testID="shift-card">
      <View style={styles.between}>
        <Label>{openShift ? 'Shift in progress' : 'Current shift'}</Label>
        <Badge label={openShift ? 'ON SHIFT' : 'OFF SHIFT'} tone={openShift ? (origin?.stale ? 'warning' : 'success') : 'neutral'} icon={openShift ? 'radio' : undefined} />
      </View>
      {openShift && origin ? (
        <>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text variant="stat" color={origin.stale ? 'warning' : 'success'}>{elapsed(openShift.clockIn)}</Text>
              <Text variant="caption" color="textMuted">{origin.started}{openShift.jobReference ? ` · ${openShift.jobReference}` : ''}</Text>
            </View>
            <Icon name="clock" size={28} color={origin.stale ? 'warning' : 'success'} />
          </View>
          {origin.note ? <Text variant="bodySmall" color="textSecondary">{origin.note}</Text> : null}
          {origin.stale ? (
            <Text variant="bodySmall" color="warning">This shift is still open from a previous day. Clock out now and let the office know the correct finish time.</Text>
          ) : null}
        </>
      ) : (
        <Text variant="bodySmall" color="textMuted">Today: {todayHours.toFixed(2)} hours recorded</Text>
      )}
      <Button
        testID="clock-button"
        label={openShift ? 'Clock out' : 'Clock in'}
        icon={openShift ? 'log-out' : 'log-in'}
        variant={openShift ? 'dangerOutline' : 'primary'}
        size="lg"
        loading={clock.isPending}
        haptic
        onPress={() => void act(openShift ? 'out' : 'in')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({ between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm } });
