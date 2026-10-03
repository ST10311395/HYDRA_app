import { useState } from 'react';
import { View } from 'react-native';
import { createScheduleSchema, type ScheduleEventDto } from '@hydra/shared';
import { ApiError, api, errorMessage } from '../../api/client';
import { useEmployees, useSimpleMutation } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { Button, Card, Checkbox, DateField, Label, Segmented, SelectField, Text, TextField, colors, confirm, spacing, toast } from '../../design-system';
import { ScheduleView } from '../../features/ScheduleView';
import { fmtDateTime, sastInstant, todayIso } from '../../utils/format';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Workforce schedule management: team calendar (jobs, leave, events) and conflict-checked event creation. */
export default function AdminSchedule() {
  const [mode, setMode] = useState<'CALENDAR' | 'NEW'>('CALENDAR');
  const [employeeFilter, setEmployeeFilter] = useState<string>('ALL');
  const employees = useEmployees();
  const empOptions = (employees.data ?? []).filter((e) => e.isActive).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }));
  const remove = useSimpleMutation((id: string) => api.delete<void>(`/schedules/${id}`), [['schedules'], ['availability']]);

  const onEventPress = async (e: ScheduleEventDto) => {
    if (!(await confirm({ title: `Delete “${e.title}”?`, message: `${e.employeeName} · ${fmtDateTime(e.startAt)}. The electrician's calendar updates immediately.`, confirmLabel: 'Delete event', destructive: true }))) return;
    remove.mutate(e.id, { onSuccess: () => toast.success('Event deleted'), onError: (x) => toast.error(errorMessage(x)) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Schedule" back />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'CALENDAR', label: 'Team calendar' }, { value: 'NEW', label: 'New event' }]} />
        {mode === 'CALENDAR' ? (
          <SelectField value={employeeFilter} onChange={setEmployeeFilter} options={[{ value: 'ALL', label: 'All electricians' }, ...empOptions]} />
        ) : null}
      </View>
      {mode === 'CALENDAR' ? (
        <View style={{ flex: 1 }}>
          <ScheduleView
            key={employeeFilter}
            employeeId={employeeFilter === 'ALL' ? undefined : employeeFilter}
            jobRoute={(id) => `/admin/job/${id}`}
            showEmployee={employeeFilter === 'ALL'}
            onEventPress={(e) => void onEventPress(e)}
          />
        </View>
      ) : (
        <NewEvent employeeOptions={empOptions} onDone={() => setMode('CALENDAR')} />
      )}
    </View>
  );
}

function NewEvent({ employeeOptions, onDone }: { employeeOptions: { value: string; label: string }[]; onDone: () => void }) {
  const [f, setF] = useState({ employeeId: '', eventType: 'TRAINING' as 'TRAINING' | 'MEETING' | 'OTHER', title: '', date: todayIso(), start: '08:00', end: '10:00', notes: '' });
  const [override, setOverride] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useSimpleMutation((body: object) => api.post<ScheduleEventDto>('/schedules', body), [['schedules'], ['availability']]);

  const submit = () => {
    if (!HHMM.test(f.start) || !HHMM.test(f.end)) {
      setErrors({ endAt: 'Use HH:MM times' });
      return;
    }
    const parsed = createScheduleSchema.safeParse({
      employeeId: f.employeeId, eventType: f.eventType, title: f.title, startAt: sastInstant(f.date, f.start), endAt: sastInstant(f.date, f.end), notes: f.notes, overrideConflicts: override,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: () => { toast.success('Event added to the calendar'); onDone(); },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'SCHEDULE_CONFLICT') setConflict(e.message);
        else toast.error(errorMessage(e));
      },
    });
  };

  return (
    <Screen withTabBar={false} footer={<Button label="Add event" icon="calendar" loading={create.isPending} onPress={submit} />}>
      <Card style={{ gap: spacing.md }}>
        <Label>Calendar event</Label>
        <SelectField label="Electrician" value={f.employeeId || undefined} onChange={(v) => setF({ ...f, employeeId: v })} options={employeeOptions} error={errors.employeeId} />
        <Segmented value={f.eventType} onChange={(v) => setF({ ...f, eventType: v })} options={[{ value: 'TRAINING', label: 'Training' }, { value: 'MEETING', label: 'Meeting' }, { value: 'OTHER', label: 'Other' }]} />
        <TextField label="Title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={120} error={errors.title} placeholder="e.g. Working at heights refresher" />
        <DateField label="Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} minDate={todayIso()} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><TextField label="Start (SAST)" value={f.start} onChangeText={(v) => setF({ ...f, start: v })} maxLength={5} /></View>
          <View style={{ flex: 1 }}><TextField label="End (SAST)" value={f.end} onChangeText={(v) => setF({ ...f, end: v })} maxLength={5} error={errors.endAt} /></View>
        </View>
        <TextField label="Notes (optional)" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline maxLength={500} />
      </Card>
      {conflict ? (
        <Card accent="danger" style={{ gap: spacing.sm }}>
          <Text variant="title" weight="bold" color="dangerBright">Schedule conflict</Text>
          <Text variant="bodySmall" color="textMuted">{conflict}</Text>
          <Checkbox checked={override} onChange={setOverride} label="Override and add anyway (audited)" />
        </Card>
      ) : null}
    </Screen>
  );
}
