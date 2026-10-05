/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { PayrollDto, PayrollPreviewLineDto, PayrollStatus } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { flatten, usePayrollPreview, usePayrolls, useSimpleMutation } from '../../api/queries';
import { parseAmount, useIsOwner } from '../../components/admin';
import { BrandHeader } from '../../components/layout';
import { Badge, Button, Card, DateField, Divider, EmptyState, FilterChips, KeyValue, Label, Segmented, Text, TextField, colors, confirm, spacing, toast } from '../../design-system';
import { fmtDate, money, todayIso } from '../../utils/format';
import { QueryFallback, notReady } from '../../components/QueryState';
import { summarisePayroll } from '../../features/payrollSummary';

const monthStart = () => `${todayIso().slice(0, 8)}01`;
const KEYS = [['payroll'], ['timesheets'], ['dashboard']];

/**
 * Payroll (spec §10.9, PDF Story 18): preview from CONFIRMED timesheets in a period, process into
 * DRAFT records, Owner approves and finalises (immutable), corrections are linked records.
 */
export default function Payroll() {
  const [tab, setTab] = useState<'RUN' | 'RECORDS'>('RUN');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Payroll" back />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'RUN', label: 'Run payroll' }, { value: 'RECORDS', label: 'Payroll records' }]} />
      </View>
      {tab === 'RUN' ? <RunPayroll onProcessed={() => setTab('RECORDS')} /> : <Records />}
    </View>
  );
}

function RunPayroll({ onProcessed }: { onProcessed: () => void }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const preview = usePayrollPreview();
  const process = useSimpleMutation((body: object) => api.post<PayrollDto[]>('/payroll', body), KEYS);
  // Figures always describe the period they were calculated for; changing a date clears them.
  const period = preview.variables as { periodStart: string; periodEnd: string } | undefined;
  const periodLabel = period ? `${fmtDate(period.periodStart)} – ${fmtDate(period.periodEnd)}` : '';
  const summary = preview.data ? summarisePayroll(preview.data, periodLabel) : null;
  const changeFrom = (v: string) => { setFrom(v); preview.reset(); };
  const changeTo = (v: string) => { setTo(v); preview.reset(); };

  return (
    <FlatList
      data={summary?.relevant ?? []}
      keyExtractor={(l) => l.employeeId}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          <Card style={{ gap: spacing.md }}>
            <Label>Pay period</Label>
            <DateField label="From" value={from} onChange={changeFrom} />
            <DateField label="To" value={to} onChange={changeTo} error={from > to ? 'End must be on or after start' : undefined} />
            <Button label="Preview from confirmed timesheets" icon="eye" variant="secondary" disabled={from > to} loading={preview.isPending}
              onPress={() => preview.mutate({ periodStart: from, periodEnd: to }, { onError: (e) => toast.error(errorMessage(e)) })} />
            <Text variant="caption" color="textMuted">Only CONFIRMED timesheets whose work date falls inside the period count. Timesheets for jobs whose invoice is not yet paid are held when the cash-flow rule is enabled in settings.</Text>
          </Card>
          {summary && period ? (
            <Card accent="primary" style={{ gap: 4 }} testID="payroll-summary">
              <KeyValue label="Pay period" value={periodLabel} />
              <KeyValue label="Confirmed hours payable" value={`${summary.payableHours.toFixed(2)} h`} mono />
              <KeyValue label="Employees payable" value={String(summary.payable.length)} />
              {summary.heldSheets ? <KeyValue label="Timesheets held (unpaid invoice)" value={String(summary.heldSheets)} valueColor="warning" /> : null}
              <KeyValue label="Total net pay" value={money(summary.totalNet)} mono />
              {summary.zeroReason ? <Text variant="bodySmall" color="warning" style={{ marginTop: spacing.xs }} testID="payroll-zero-reason">{summary.zeroReason}</Text> : null}
              {summary.idleEmployees ? <Text variant="caption" color="textMuted">{summary.idleEmployees} employee{summary.idleEmployees === 1 ? ' has' : 's have'} no confirmed timesheets in this period.</Text> : null}
              <Button label="Process into draft payroll" icon="check-square" disabled={!summary.payable.length} loading={process.isPending} style={{ marginTop: spacing.sm }}
                onPress={() => void (async () => {
                  if (!(await confirm({ title: 'Process payroll?', message: `Creates ${summary.payable.length} draft record(s) for ${periodLabel}. Figures are computed on the server. The owner must approve and finalise.`, confirmLabel: 'Process' }))) return;
                  process.mutate(period, { onSuccess: () => { toast.success('Draft payroll created'); preview.reset(); onProcessed(); }, onError: (e) => toast.error(errorMessage(e)) });
                })()} />
            </Card>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <PreviewLine line={item} />}
    />
  );
}

function PreviewLine({ line: l }: { line: PayrollPreviewLineDto }) {
  return (
    <Card style={{ gap: 4, opacity: l.alreadyProcessed ? 0.6 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title" weight="bold">{l.employeeName}</Text>
        {l.alreadyProcessed ? <Badge label="PROCESSED" /> : <Badge label={`${l.timesheetIds.length} SHEETS`} tone="primary" />}
      </View>
      <KeyValue label={`${l.totalHours.toFixed(2)} h × ${money(l.hourlyRate)}`} value={money(l.grossPay)} mono />
      <KeyValue label="PAYE" value={`− ${money(l.paye)}`} mono />
      <KeyValue label="UIF" value={`− ${money(l.uif)}`} mono />
      <Divider />
      <KeyValue label="Net pay" value={money(l.netPay)} valueColor="success" mono />
      {l.heldTimesheetIds.length ? <Text variant="caption" color="warning">{l.heldTimesheetIds.length} timesheet(s) held until the job invoice is paid.</Text> : null}
    </Card>
  );
}

function Records() {
  const [status, setStatus] = useState<'ALL' | PayrollStatus>('ALL');
  const q = usePayrolls({ status: status === 'ALL' ? undefined : status });
  return (
    <FlatList
      data={flatten(q.data)}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
      ListHeaderComponent={<FilterChips value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'APPROVED', label: 'Approved' }, { value: 'FINALISED', label: 'Finalised' }]} />}
      renderItem={({ item }) => <PayrollCard p={item} />}
      ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="dollar-sign" title="No payroll records" />}
      onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
    />
  );
}

function PayrollCard({ p }: { p: PayrollDto }) {
  const owner = useIsOwner();
  const [correcting, setCorrecting] = useState(false);
  const [corr, setCorr] = useState({ reason: '', gross: '', deductions: '0' });
  const approve = useSimpleMutation(() => api.post<PayrollDto>(`/payroll/${p.id}/approve`), KEYS);
  const finalise = useSimpleMutation(() => api.post<PayrollDto>(`/payroll/${p.id}/finalise`), KEYS);
  const discard = useSimpleMutation(() => api.delete<void>(`/payroll/${p.id}`), KEYS);
  const correct = useSimpleMutation((body: object) => api.post<PayrollDto>(`/payroll/${p.id}/corrections`, body), KEYS);
  const gross = parseAmount(corr.gross);
  const ded = parseAmount(corr.deductions);
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  return (
    <Card accent={p.status === 'FINALISED' ? 'success' : 'none'} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title" weight="bold">{p.employeeName}</Text>
        <Badge label={p.status} tone={p.status === 'FINALISED' ? 'success' : p.status === 'APPROVED' ? 'primary' : 'warning'} />
      </View>
      <Text variant="caption" color="textMuted">{fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)} · {p.timesheetCount} timesheet(s){p.correctsPayrollId ? ' · correction' : ''}</Text>
      <KeyValue label={`${p.totalHours.toFixed(2)} h × ${money(p.hourlyRate)}`} value={money(p.grossPay)} mono />
      <KeyValue label="Deductions" value={`− ${money(p.deductions)}`} mono />
      <KeyValue label="Net pay" value={money(p.netPay)} valueColor="success" mono />
      <Text variant="caption" color="textFaint">Processed by {p.processedByName}{p.approvedByName ? ` · approved by ${p.approvedByName}` : ''}{p.correctionReason ? ` · ${p.correctionReason}` : ''}</Text>

      {p.status === 'DRAFT' ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Button label="Discard" size="sm" variant="dangerOutline" style={{ flex: 1 }} loading={discard.isPending} onPress={() => void (async () => {
            if (await confirm({ title: 'Discard draft?', message: 'The timesheets are released for the next payroll run.', confirmLabel: 'Discard', destructive: true })) discard.mutate(undefined, { onSuccess: () => toast.success('Draft discarded'), onError: onErr });
          })()} />
          {owner ? <Button label="Approve" size="sm" style={{ flex: 1 }} loading={approve.isPending} onPress={() => approve.mutate(undefined, { onSuccess: () => toast.success('Payroll approved'), onError: onErr })} /> : null}
        </View>
      ) : null}
      {p.status === 'APPROVED' && owner ? (
        <Button label="Finalise (locks record)" icon="lock" size="sm" style={{ marginTop: spacing.sm }} loading={finalise.isPending} onPress={() => void (async () => {
          if (await confirm({ title: 'Finalise payroll?', message: 'Finalised payroll is immutable. Mistakes can only be fixed with a linked correction.', confirmLabel: 'Finalise' })) finalise.mutate(undefined, { onSuccess: () => toast.success('Payroll finalised'), onError: onErr });
        })()} />
      ) : null}
      {p.status !== 'DRAFT' && !owner ? <Text variant="caption" color="textMuted">Approval, finalisation and corrections are owner actions.</Text> : null}
      {p.status === 'FINALISED' && owner ? (
        correcting ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Label>Linked correction</Label>
            <TextField label="Reason" value={corr.reason} onChangeText={(v) => setCorr({ ...corr, reason: v })} maxLength={500} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><TextField label="Gross ± (R)" value={corr.gross} onChangeText={(v) => setCorr({ ...corr, gross: v })} keyboardType="numbers-and-punctuation" placeholder="-150.00" /></View>
              <View style={{ flex: 1 }}><TextField label="Deductions ± (R)" value={corr.deductions} onChangeText={(v) => setCorr({ ...corr, deductions: v })} keyboardType="numbers-and-punctuation" /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Cancel" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setCorrecting(false)} />
              <Button label="Create correction" size="sm" style={{ flex: 1 }} loading={correct.isPending} disabled={corr.reason.trim().length < 5 || !Number.isFinite(gross) || !Number.isFinite(ded)}
                onPress={() => correct.mutate({ reason: corr.reason.trim(), grossAdjustment: gross, deductionsAdjustment: ded }, { onSuccess: () => { toast.success('Correction created'); setCorrecting(false); }, onError: onErr })} />
            </View>
          </View>
        ) : <Button label="Create correction" icon="edit" size="sm" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => setCorrecting(true)} />
      ) : null}
    </Card>
  );
}
