/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { View } from 'react-native';
import { flatten, useCurrentShift, useTimesheets } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, EmptyState, KeyValue, Label, LoadingCards, SectionHeader, Text, colors } from '../../../design-system';
import { ShiftCard } from '../../../features/ShiftCard';
import { addDaysIso, fmtDate, fmtTime, todayIso } from '../../../utils/format';
import { QueryFallback, notReady } from '../../../components/QueryState';

const TONE = { OPEN: 'success', SUBMITTED: 'warning', CONFIRMED: 'primary', REJECTED: 'danger', PAID: 'secondary' } as const;

export default function TimesheetScreen() {
  const current = useCurrentShift();
  const sheets = useTimesheets();
  const list = flatten(sheets.data);
  const weekStart = addDaysIso(todayIso(), -((new Date().getDay() + 6) % 7));
  const weekHours = list.filter((t) => t.workDate >= weekStart).reduce((a, t) => a + (t.totalHours ?? 0), 0);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Timesheet" />
      <Screen onRefresh={() => void Promise.all([current.refetch(), sheets.refetch()])} refreshing={sheets.isRefetching}>
        {current.data ? <ShiftCard openShift={current.data.openShift} todayHours={current.data.todayHours} /> : <LoadingCards count={1} />}
        <Card style={{ gap: 4 }}>
          <Label>This week</Label>
          <Text variant="stat" color="primaryBright">{weekHours.toFixed(2)} h</Text>
          <Text variant="caption" color="textMuted">Submitted shifts are confirmed by the office before payroll.</Text>
        </Card>
        <SectionHeader title="History" icon="list" />
        {notReady(sheets) ? <QueryFallback query={sheets} /> : list.length === 0 ? <EmptyState icon="clock" title="No shifts yet" message="Clock in to start recording hours." /> : list.map((t) => (
          <Card key={t.id} style={{ gap: 4 }} onPress={t.jobId ? () => router.push(`/employee/job/${t.jobId}`) : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="title" weight="bold">{fmtDate(t.workDate, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
              <Badge label={t.status} tone={TONE[t.status]} />
            </View>
            <KeyValue label={`${fmtTime(t.clockIn)} – ${t.clockOut ? fmtTime(t.clockOut) : 'now'}`} value={t.totalHours !== null ? `${t.totalHours.toFixed(2)} h` : 'In progress'} mono />
            {t.jobReference ? <Text variant="caption" color="primaryBright">{t.jobReference}</Text> : null}
            {t.notes ? <Text variant="caption" color="textMuted">{t.notes}</Text> : null}
          </Card>
        ))}
        {sheets.hasNextPage ? <Button label="Load more" variant="ghost" onPress={() => void sheets.fetchNextPage()} /> : null}
        <Button label="Leave requests" icon="sun" variant="secondary" onPress={() => router.push('/employee/leave')} />
        <Text variant="caption" color="textFaint" align="center">Pay figures are processed by the office and are not shown in the field app.</Text>
      </Screen>
    </View>
  );
}
