/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { EmployeeDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { flatten, useEmployee, useJobs, useLeave, useSimpleMutation, useTimesheets } from '../../../api/queries';
import { parseAmount, useIsOwner } from '../../../components/admin';
import { JobCard } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Checkbox, KeyValue, Label, Text, TextField, colors, spacing, toast } from '../../../design-system';
import { fmtDate, money } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { callNumber } from '../../../utils/links';
import { QueryFallback } from '../../../components/QueryState';

/** Employee profile for admins: live status, assignments, leave, timesheets; owner edits pay details. */
export default function AdminEmployee() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const owner = useIsOwner();
  const q = useEmployee(id);
  const e = q.data;
  const jobs = useJobs({ employeeId: id, status: 'SCHEDULED,IN_PROGRESS,INSPECTION_PENDING', sort: 'scheduled' });
  const leave = useLeave({ employeeId: id });
  const ts = useTimesheets({ employeeId: id });
  const [edit, setEdit] = useState({ certificationNo: '', specialisation: '', hourlyRate: '', taxRate: '', isActive: true });
  useSyncFrom(e, (x) => setEdit({ certificationNo: x.certificationNo ?? '', specialisation: x.specialisation ?? '', hourlyRate: String(x.hourlyRate), taxRate: String(Math.round(x.taxRate * 100)), isActive: x.isActive }));
  const save = useSimpleMutation((body: object) => api.patch<EmployeeDto>(`/employees/${id}`, body), [['employee', id], ['employees']]);

  const rate = parseAmount(edit.hourlyRate);
  const tax = parseAmount(edit.taxRate);
  const valid = Number.isFinite(rate) && rate >= 0 && rate <= 10_000 && Number.isFinite(tax) && tax >= 0 && tax <= 45;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={e ? `${e.firstName} ${e.lastName}` : 'Employee'} back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!e ? <QueryFallback query={q} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="h2">{e.firstName} {e.lastName}</Text>
                {!e.isActive ? <Badge label="INACTIVE" /> : e.onLeaveToday ? <Badge label="ON LEAVE" tone="warning" /> : e.clockedIn ? <Badge label="CLOCKED IN" tone="success" /> : <Badge label="OFF SHIFT" />}
              </View>
              {e.staffNumber ? <KeyValue label="Staff number" value={e.staffNumber} mono /> : null}
              <KeyValue label="Email" value={e.email} />
              <KeyValue label="Phone" value={e.phone ?? '—'} />
              <KeyValue label="Specialisation" value={e.specialisation ?? '—'} />
              <KeyValue label="Registration / cert." value={e.certificationNo ?? '—'} />
              <KeyValue label="Hourly rate" value={money(e.hourlyRate)} mono />
              <KeyValue label="Tax rate (PAYE est.)" value={`${Math.round(e.taxRate * 100)}%`} />
              {e.phone ? <Button label="Call" icon="phone" size="sm" variant="secondary" onPress={() => void callNumber(e.phone!)} /> : null}
            </Card>

            {owner ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <Label color="primaryBright">Owner: employment details</Label>
                <TextField label="Specialisation" value={edit.specialisation} onChangeText={(v) => setEdit({ ...edit, specialisation: v })} maxLength={120} />
                <TextField label="Registration / certification no." value={edit.certificationNo} onChangeText={(v) => setEdit({ ...edit, certificationNo: v })} maxLength={60} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><TextField label="Hourly rate (R)" value={edit.hourlyRate} onChangeText={(v) => setEdit({ ...edit, hourlyRate: v })} keyboardType="decimal-pad" /></View>
                  <View style={{ flex: 1 }}><TextField label="Tax rate (%)" value={edit.taxRate} onChangeText={(v) => setEdit({ ...edit, taxRate: v })} keyboardType="decimal-pad" error={Number.isFinite(tax) && tax > 45 ? 'Max 45%' : undefined} /></View>
                </View>
                <Checkbox checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Active (available for assignment)" />
                <Button label="Save" icon="save" disabled={!valid} loading={save.isPending} onPress={() => save.mutate(
                  { certificationNo: edit.certificationNo, specialisation: edit.specialisation, hourlyRate: rate, taxRate: Math.round(tax * 100) / 10_000, isActive: edit.isActive },
                  { onSuccess: () => toast.success('Employee updated'), onError: (x) => toast.error(errorMessage(x)) },
                )} />
              </Card>
            ) : null}

            <Label>Current assignments</Label>
            {flatten(jobs.data).length === 0 ? <Text variant="bodySmall" color="textMuted">No active jobs.</Text> : flatten(jobs.data).map((j) => (
              <JobCard key={j.id} job={j} showCustomer showElectrician={false} onPress={() => router.push(`/admin/job/${j.id}`)} />
            ))}

            <Card style={{ gap: spacing.sm }}>
              <Label>Leave</Label>
              {flatten(leave.data).slice(0, 5).map((l) => (
                <KeyValue key={l.id} label={`${l.leaveType.toLowerCase()} · ${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`} value={l.status} valueColor={l.status === 'APPROVED' ? 'success' : l.status === 'PENDING' ? 'warning' : 'textMuted'} />
              ))}
              {flatten(leave.data).length === 0 ? <Text variant="bodySmall" color="textMuted">No leave requests.</Text> : null}
              <Button label="Leave approvals" variant="ghost" size="sm" onPress={() => router.push('/admin/workforce?tab=LEAVE')} />
            </Card>

            <Card style={{ gap: spacing.sm }}>
              <Label>Recent timesheets</Label>
              {flatten(ts.data).slice(0, 7).map((t) => (
                <KeyValue key={t.id} label={`${fmtDate(t.workDate)}${t.jobReference ? ` · ${t.jobReference}` : ''} · ${t.status.toLowerCase()}`} value={t.totalHours !== null ? `${t.totalHours.toFixed(2)} h` : 'open'} mono />
              ))}
              {flatten(ts.data).length === 0 ? <Text variant="bodySmall" color="textMuted">No timesheets.</Text> : null}
              <Button label="Review timesheets" variant="ghost" size="sm" onPress={() => router.push('/admin/workforce?tab=TIMESHEETS')} />
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}
