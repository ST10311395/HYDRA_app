import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { JOB_STATUS_LABELS } from '@hydra/shared';
import { useReport } from '../../api/queries';
import { OwnerGate } from '../../components/admin';
import { BrandHeader, Screen } from '../../components/layout';
import { Button, Card, DateField, KeyValue, Label, ProgressBar, Segmented, Text, colors, spacing } from '../../design-system';
import { addDaysIso, fmtDate, money, todayIso } from '../../utils/format';
import { QueryFallback } from '../../components/QueryState';

type Preset = '7' | '30' | '90' | 'CUSTOM';

/** Owner/manager business reporting (spec §10.10, PDF Story 21). API enforces ADMIN_OWNER. */
export default function Reports() {
  return (
    <OwnerGate section="Reports">
      <ReportsInner />
    </OwnerGate>
  );
}

function ReportsInner() {
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(addDaysIso(todayIso(), -30));
  const [to, setTo] = useState(todayIso());
  const q = useReport(from, to);
  const r = q.data;

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'CUSTOM') {
      setFrom(addDaysIso(todayIso(), -Number(p)));
      setTo(todayIso());
    }
  };
  const maxStatus = Math.max(1, ...(r?.jobsByStatus.map((s) => s.count) ?? [1]));
  const maxService = Math.max(1, ...(r?.jobsByService.map((s) => s.count) ?? [1]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Reports" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        <Segmented value={preset} onChange={choose} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'CUSTOM', label: 'Custom' }]} />
        {preset === 'CUSTOM' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><DateField label="From" value={from} onChange={setFrom} /></View>
            <View style={{ flex: 1 }}><DateField label="To" value={to} onChange={setTo} error={from > to ? 'Before start' : undefined} /></View>
          </View>
        ) : null}
        {!r ? <QueryFallback query={q} count={3} /> : (
          <>
            <Text variant="caption" color="textMuted">{fmtDate(r.from)} – {fmtDate(r.to)}</Text>
            <View style={styles.grid}>
              <Tile label="Revenue collected" value={money(r.revenue)} color="success" />
              <Tile label="Payments" value={String(r.paymentsCount)} />
              <Tile label="Jobs created" value={String(r.jobsCreated)} color="primaryBright" />
              <Tile label="Jobs completed" value={String(r.jobsCompleted)} color="primaryBright" />
              <Tile label="Outstanding" value={money(r.outstandingAmount)} color="warning" />
              <Tile label="Quote acceptance" value={`${Math.round(r.quoteAcceptanceRate * 100)}%`} color="secondaryBright" />
            </View>
            <Card style={{ gap: 4 }}>
              <Label>Operations</Label>
              <KeyValue label="Average quote value" value={money(r.averageQuoteValue)} mono />
              <KeyValue label="Materials cost" value={money(r.materialsCost)} mono />
              <KeyValue label="Labour hours (timesheets)" value={`${r.labourHours.toFixed(1)} h`} mono />
              <KeyValue label="Payroll net (finalised)" value={money(r.payrollNet)} mono />
              <KeyValue label="Enquiries" value={String(r.enquiries)} mono />
              <KeyValue label="Enquiry → job conversion" value={`${Math.round(r.enquiryConversionRate * 100)}%`} mono />
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Jobs by status</Label>
              {r.jobsByStatus.length === 0 ? <Text variant="bodySmall" color="textMuted">No jobs in this period.</Text> : r.jobsByStatus.map((s) => (
                <View key={s.status} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodySmall">{JOB_STATUS_LABELS[s.status]}</Text>
                    <Text variant="mono">{s.count}</Text>
                  </View>
                  <ProgressBar value={s.count / maxStatus} />
                </View>
              ))}
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Jobs by service</Label>
              {r.jobsByService.length === 0 ? <Text variant="bodySmall" color="textMuted">No jobs in this period.</Text> : r.jobsByService.map((s) => (
                <View key={s.serviceName} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodySmall" style={{ flex: 1 }} numberOfLines={2}>{s.serviceName}</Text>
                    <Text variant="mono">{s.count}</Text>
                  </View>
                  <ProgressBar value={s.count / maxService} tone="secondary" />
                </View>
              ))}
            </Card>
            <Button label="Export data (CSV / PDF)" icon="download" onPress={() => router.push('/admin/exports')} />
          </>
        )}
      </Screen>
    </View>
  );
}

function Tile({ label, value, color = 'text' }: { label: string; value: string; color?: 'text' | 'success' | 'warning' | 'primaryBright' | 'secondaryBright' }) {
  return (
    <Card style={styles.tile}>
      <Text variant="h3" color={color} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text variant="caption" color="textMuted">{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47.5%', flexGrow: 1, gap: 4 },
});
