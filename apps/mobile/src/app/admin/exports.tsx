/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { EXPORT_TYPES, exportRequestSchema, type ExportLogDto, type ExportType } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { flatten, qk, useExports } from '../../api/queries';
import { AdminList, OwnerGate } from '../../components/admin';
import { Badge, Button, Card, DateField, Label, Segmented, SelectField, Text, spacing, toast } from '../../design-system';
import { saveAndShare } from '../../features/exportFile';
import { addDaysIso, fmtDate, fmtDateTime, todayIso } from '../../utils/format';

const TYPE_LABEL: Record<ExportType, string> = {
  CUSTOMERS: 'Customers', EMPLOYEES: 'Employees', JOBS: 'Jobs', INVOICES: 'Invoices', PAYMENTS: 'Payments',
  TIMESHEETS: 'Timesheets', PAYROLL: 'Payroll', INVENTORY: 'Inventory', ENQUIRIES: 'Enquiries',
};

/** Owner-only data export (spec §10.10, PDF Story 21). Every export is logged in DATA_EXPORT_LOG and the audit trail. */
export default function Exports() {
  return (
    <OwnerGate section="Exports">
      <ExportsInner />
    </OwnerGate>
  );
}

function ExportsInner() {
  const qc = useQueryClient();
  const history = useExports();
  const [type, setType] = useState<ExportType>('JOBS');
  const [format, setFormat] = useState<'CSV' | 'PDF'>('CSV');
  const [from, setFrom] = useState(addDaysIso(todayIso(), -30));
  const [to, setTo] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const parsed = exportRequestSchema.safeParse({ type, format, from, to });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the date range');
      return;
    }
    setBusy(true);
    try {
      const file = await api.download('/exports', parsed.data);
      await saveAndShare(file.bytes, file.fileName, file.contentType.split(';')[0] ?? 'text/csv');
      toast.success(`${file.fileName}${file.rowCount !== null ? ` · ${file.rowCount} rows` : ''} exported`);
      await qc.invalidateQueries({ queryKey: qk.exports });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminList<ExportLogDto>
      section="Exports"
      items={flatten(history.data)}
      query={history}
      emptyIcon="download"
      emptyTitle="No exports yet"
      header={
        <>
          <Card accent="primary" style={{ gap: spacing.md }}>
            <Label color="primaryBright">New export</Label>
            <SelectField label="Data category" value={type} onChange={setType} options={EXPORT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
            <Segmented value={format} onChange={setFormat} options={[{ value: 'CSV', label: 'CSV (spreadsheet)' }, { value: 'PDF', label: 'PDF report' }]} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><DateField label="From" value={from} onChange={setFrom} /></View>
              <View style={{ flex: 1 }}><DateField label="To" value={to} onChange={setTo} error={from > to ? 'Before start' : undefined} /></View>
            </View>
            <Text variant="caption" color="textMuted">Exports contain personal information. Store them securely and share only with authorised people (POPIA). This export is recorded in the audit log.</Text>
            <Button label="Export & share" icon="download" loading={busy} disabled={from > to} onPress={() => void run()} testID="export-submit" />
          </Card>
          <Label>Export history</Label>
        </>
      }
      renderItem={({ item: e }) => (
        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="title" weight="bold">{TYPE_LABEL[e.exportType as ExportType] ?? e.exportType}</Text>
            <Badge label={e.format} tone="primary" />
          </View>
          <Text variant="caption" color="textMuted">{e.rowCount} rows · {typeof e.filters.from === 'string' ? `${fmtDate(e.filters.from)} – ${fmtDate(String(e.filters.to))}` : 'all dates'}</Text>
          <Text variant="caption" color="textFaint">{e.adminName} · {fmtDateTime(e.createdAt)}</Text>
        </Card>
      )}
    />
  );
}
