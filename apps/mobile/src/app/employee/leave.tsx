import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { LeaveRequestDto, LeaveType } from '@hydra/shared';
import { ApiError, api, errorMessage, newIdempotencyKey } from '../../api/client';
import { flatten, useLeave, useSimpleMutation } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { Badge, Button, Card, DateField, EmptyState, Label, SelectField, Text, TextField, colors, confirm, spacing, toast } from '../../design-system';
import { fmtDate, todayIso } from '../../utils/format';
import { QueryFallback, notReady } from '../../components/QueryState';

const TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;

/** Leave requests (PDF Story 16). */
export default function LeaveScreen() {
  const leave = useLeave();
  const [form, setForm] = useState<{ leaveType: LeaveType; startDate?: string; endDate?: string; reason: string }>({ leaveType: 'ANNUAL', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per request (renewed after success): a retry after a timeout cannot file it twice.
  const [requestKey, setRequestKey] = useState(newIdempotencyKey);
  const sending = useRef(false);
  const create = useSimpleMutation((body: object) => api.post<LeaveRequestDto>('/leave-requests', body, { idempotencyKey: requestKey }), [['leave'], ['dashboard'], ['schedules']]);
  const cancel = useSimpleMutation((id: string) => api.post<LeaveRequestDto>(`/leave-requests/${id}/cancel`), [['leave'], ['dashboard'], ['schedules']]);

  const submit = () => {
    if (sending.current) return;
    const e: Record<string, string> = {};
    if (!form.startDate) e.startDate = 'Choose a start date';
    if (!form.endDate) e.endDate = 'Choose an end date';
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'End date must be on or after the start date';
    if (form.reason.trim().length < 3) e.reason = 'Give a short reason';
    setErrors(e);
    if (Object.keys(e).length) return;
    sending.current = true;
    create.mutate({ ...form, reason: form.reason.trim() }, {
      onSuccess: () => {
        toast.success('Leave request sent for approval');
        setForm({ leaveType: 'ANNUAL', reason: '' });
        setRequestKey(newIdempotencyKey());
      },
      onError: (err) => {
        // The form keeps its values for a retry.
        if (err instanceof ApiError) setErrors(err.fieldErrors());
        toast.error(errorMessage(err));
      },
      onSettled: () => {
        sending.current = false;
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Leave" back />
      <Screen withTabBar={false} onRefresh={() => void leave.refetch()} refreshing={leave.isRefetching}>
        <Card style={{ gap: spacing.md }}>
          <Label>New leave request</Label>
          <SelectField label="Type" value={form.leaveType} onChange={(v) => setForm({ ...form, leaveType: v })} options={[{ value: 'ANNUAL', label: 'Annual leave' }, { value: 'SICK', label: 'Sick leave' }, { value: 'FAMILY', label: 'Family responsibility' }, { value: 'UNPAID', label: 'Unpaid leave' }, { value: 'OTHER', label: 'Other' }]} />
          <DateField label="From" value={form.startDate} minDate={todayIso()} onChange={(v) => setForm({ ...form, startDate: v, endDate: form.endDate && form.endDate < v ? v : form.endDate })} error={errors.startDate} />
          <DateField label="To" value={form.endDate} minDate={form.startDate ?? todayIso()} onChange={(v) => setForm({ ...form, endDate: v })} error={errors.endDate} />
          <TextField label="Reason" value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} multiline maxLength={500} error={errors.reason} />
          <Button label="Submit request" icon="send" loading={create.isPending} onPress={submit} />
        </Card>
        <Label>My requests</Label>
        {notReady(leave) ? <QueryFallback query={leave} /> : flatten(leave.data).length === 0 ? <EmptyState icon="sun" title="No leave requests" message="Requests you submit appear here with their approval status." /> : flatten(leave.data).map((l) => (
          <Card key={l.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="title" weight="bold">{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</Text>
              <Badge label={l.status} tone={TONE[l.status]} />
            </View>
            <Text variant="caption" color="textMuted">{l.leaveType.toLowerCase()} · {l.days} day{l.days === 1 ? '' : 's'} · {l.reason}</Text>
            {l.decisionNote ? <Text variant="caption" color="textSecondary">Office: {l.decisionNote}</Text> : null}
            {(l.status === 'PENDING' || (l.status === 'APPROVED' && l.startDate > todayIso())) ? (
              <Button label="Cancel request" variant="ghost" size="sm" fullWidth={false} onPress={() => void (async () => {
                if (await confirm({ title: 'Cancel leave request?', message: 'The office will be notified.', confirmLabel: 'Cancel leave', destructive: true })) {
                  cancel.mutate(l.id, { onError: (e) => toast.error(errorMessage(e)) });
                }
              })()} />
            ) : null}
          </Card>
        ))}
      </Screen>
    </View>
  );
}
