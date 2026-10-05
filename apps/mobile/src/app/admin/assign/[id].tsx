/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EmployeeAvailabilityDto, JobDetailDto } from '@hydra/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useAvailability, useJob, useJobAction } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Checkbox, DateField, EmptyState, ErrorState, Icon, Label, LoadingCards, Segmented, Text, TextField, colors, radius, spacing, toast } from '../../../design-system';
import { fmtDateTime, fmtTime, sastInstant, todayIso } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { QueryFallback } from '../../../components/QueryState';

const WINDOWS = {
  MORNING: { start: '08:00', end: '12:00' },
  AFTERNOON: { start: '12:00', end: '17:00' },
  FULL_DAY: { start: '08:00', end: '17:00' },
} as const;
type WindowKey = keyof typeof WINDOWS | 'CUSTOM';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const sastHHMM = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3_600_000).toISOString().slice(11, 16);
const sastDay = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3_600_000).toISOString().slice(0, 10);

/**
 * Electrician assignment (spec §10.4, PDF Story 2): only after quote acceptance (server-enforced),
 * shows availability, schedule conflicts and approved leave; conflicts need explicit override.
 */
export default function AssignElectrician() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const j = job.data;
  const [date, setDate] = useState(todayIso());
  const [win, setWin] = useState<WindowKey>('MORNING');
  const [start, setStart] = useState<string>(WINDOWS.MORNING.start);
  const [end, setEnd] = useState<string>(WINDOWS.MORNING.end);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [override, setOverride] = useState(false);

  // Seed the window once per job from its current booking or the customer's preference.
  useSyncFrom(j?.id, () => {
    if (!j) return;
    if (j.scheduledStart && j.scheduledEnd) {
      setDate(sastDay(j.scheduledStart));
      setWin('CUSTOM');
      setStart(sastHHMM(j.scheduledStart));
      setEnd(sastHHMM(j.scheduledEnd));
    } else {
      if (j.preferredDate && j.preferredDate >= todayIso()) setDate(j.preferredDate);
      const w: WindowKey = j.preferredTimeWindow === 'AFTERNOON' ? 'AFTERNOON' : j.preferredTimeWindow === 'MORNING' ? 'MORNING' : 'FULL_DAY';
      setWin(w);
      setStart(WINDOWS[w].start);
      setEnd(WINDOWS[w].end);
    }
  });

  const validTimes = HHMM.test(start) && HHMM.test(end) && start < end;
  const startIso = validTimes ? sastInstant(date, start) : '';
  const endIso = validTimes ? sastInstant(date, end) : '';
  // Only query availability once the job (and its preferred window) has loaded.
  const avail = useAvailability(j ? startIso : '', j ? endIso : '', id);
  const selected = avail.data?.find((e) => e.id === employeeId) ?? null;
  const isReassign = j?.status === 'SCHEDULED' || j?.status === 'IN_PROGRESS';

  // A conflict override applies only to the exact electrician + window it was given for.
  useSyncFrom(`${employeeId}|${startIso}|${endIso}`, () => setOverride(false));

  const assign = useJobAction((body: object) => api.post<JobDetailDto>(`/jobs/${id}/assign`, body));

  const submit = () => {
    if (!employeeId || !validTimes) return;
    assign.mutate(
      { employeeId, scheduledStart: startIso, scheduledEnd: endIso, notes: notes.trim() || undefined, overrideConflicts: override },
      {
        onSuccess: () => {
          toast.success(isReassign ? 'Job reassigned — electrician and customer notified' : 'Electrician assigned — job scheduled');
          router.back();
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'SCHEDULE_CONFLICT') toast.error(`${e.message} Tick “override conflicts” to proceed anyway.`);
          else toast.error(errorMessage(e));
        },
      },
    );
  };

  const pickWindow = (w: WindowKey) => {
    setWin(w);
    if (w !== 'CUSTOM') {
      setStart(WINDOWS[w].start);
      setEnd(WINDOWS[w].end);
    }
  };

  const sorted = [...(avail.data ?? [])].filter((e) => e.isActive).sort((a, b) => Number(b.available) - Number(a.available) || a.activeJobCount - b.activeJobCount);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={isReassign ? 'Reassign Job' : 'Assign Electrician'} back />
      <Screen
        withTabBar={false}
        footer={j ? (
          <Button
            label={selected ? `${isReassign ? 'Reassign to' : 'Assign'} ${selected.firstName}` : 'Choose an electrician'}
            icon="user-check"
            disabled={!selected || !validTimes || (!selected.available && !override)}
            loading={assign.isPending}
            onPress={submit}
            testID="assign-submit"
          />
        ) : undefined}
      >
        {!j ? <QueryFallback query={job} /> : (
          <>
            <Card style={{ gap: 4 }}>
              <Text variant="mono" color="primaryBright">{j.reference}</Text>
              <Text variant="h3">{j.serviceType.name}</Text>
              <Text variant="bodySmall" color="textMuted">{j.customer.name} · {j.siteAddress}</Text>
              {j.electrician ? <Text variant="caption" color="secondaryBright">Currently: {j.electrician.name} · {fmtDateTime(j.scheduledStart)}</Text> : null}
            </Card>

            <Card style={{ gap: spacing.md }}>
              <Label>Appointment window (SAST)</Label>
              <DateField label="Date" value={date} onChange={setDate} minDate={todayIso()} />
              <Segmented value={win} onChange={pickWindow} options={[{ value: 'MORNING', label: 'Morning' }, { value: 'AFTERNOON', label: 'Afternoon' }, { value: 'FULL_DAY', label: 'Full day' }, { value: 'CUSTOM', label: 'Custom' }]} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><TextField label="Start" value={start} onChangeText={(v) => { setWin('CUSTOM'); setStart(v); }} placeholder="08:00" maxLength={5} error={HHMM.test(start) ? undefined : 'HH:MM'} /></View>
                <View style={{ flex: 1 }}><TextField label="End" value={end} onChangeText={(v) => { setWin('CUSTOM'); setEnd(v); }} placeholder="12:00" maxLength={5} error={!HHMM.test(end) ? 'HH:MM' : start >= end && HHMM.test(start) ? 'After start' : undefined} /></View>
              </View>
            </Card>

            <Label>Electricians</Label>
            {!validTimes ? <Text variant="bodySmall" color="textMuted">Enter a valid time window to check availability.</Text>
              : avail.isLoading ? <LoadingCards count={2} />
              : avail.isError ? <ErrorState onRetry={() => void avail.refetch()} />
              : sorted.length === 0 ? <EmptyState icon="users" title="No active electricians" message="Add staff under More → Staff accounts." />
              : sorted.map((e) => <EmployeeOption key={e.id} e={e} selected={e.id === employeeId} onSelect={() => setEmployeeId(e.id)} />)}

            {selected && !selected.available ? (
              <Card accent="danger" style={{ gap: spacing.sm }}>
                <Text variant="title" weight="bold" color="dangerBright">Schedule conflict</Text>
                <Text variant="bodySmall" color="textMuted">{selected.firstName} already has bookings or leave in this window. Overriding is recorded in the audit log.</Text>
                <Checkbox checked={override} onChange={setOverride} label="Override conflicts and assign anyway" />
              </Card>
            ) : null}

            <TextField label="Dispatch notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="Access instructions, tools, parts to collect…" />
          </>
        )}
      </Screen>
    </View>
  );
}

function EmployeeOption({ e, selected, onSelect }: { e: EmployeeAvailabilityDto; selected: boolean; onSelect: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${e.firstName} ${e.lastName}, ${e.available ? 'available' : 'has conflicts'}`}
      onPress={onSelect}
      testID={`employee-${e.id}`}
      style={[styles.option, selected ? { borderColor: colors.primaryBright, backgroundColor: colors.primaryMuted } : null]}
    >
      <View style={styles.row}>
        <Icon name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? 'primaryBright' : 'textMuted'} />
        <View style={{ flex: 1 }}>
          <Text variant="title" weight="bold">{e.firstName} {e.lastName}</Text>
          <Text variant="caption" color="textMuted">{e.specialisation ?? 'Electrician'}{e.staffNumber ? ` · ${e.staffNumber}` : ''} · {e.activeJobCount} active job{e.activeJobCount === 1 ? '' : 's'}</Text>
        </View>
        <Badge label={e.available ? 'AVAILABLE' : e.onLeaveToday ? 'ON LEAVE' : 'CONFLICT'} tone={e.available ? 'success' : 'danger'} />
      </View>
      {e.conflicts.map((c, i) => (
        <Text key={i} variant="caption" color="warning" style={{ marginLeft: 30 }}>
          {c.type === 'LEAVE' ? '🌴' : c.type === 'JOB' ? '⚡' : '📅'} {c.title} · {fmtTime(c.startAt)}–{fmtTime(c.endAt)}
        </Text>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: { gap: 6, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
