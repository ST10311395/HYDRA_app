import { router } from 'expo-router';
import { View } from 'react-native';
import { useAiSummary } from '../../../api/ai';
import { useAdminDashboard } from '../../../api/queries';
import { useIsOwner } from '../../../components/admin';
import { SegmentLink } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Label, Text, colors, confirm, spacing, type IconName } from '../../../design-system';
import { useAuth } from '../../../store/auth';

interface Item {
  icon: IconName;
  label: string;
  route: string;
  owner?: boolean;
  badge?: string;
}

/** “More” drawer for the smaller-device tab pattern (spec §10): finance, inventory, comms, reports and settings. */
export default function More() {
  const owner = useIsOwner();
  const user = useAuth((s) => s.user);
  const dash = useAdminDashboard();
  const ai = useAiSummary();
  const k = dash.data?.kpis;
  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Smart Quote (AI)',
      items: [
        { icon: 'cpu', label: 'AI Review', route: '/admin/ai-review', badge: ai.data?.critical ? `${ai.data.critical} CRITICAL` : ai.data?.needsReview ? String(ai.data.needsReview) : undefined },
        { icon: 'book-open', label: 'AI Knowledge', route: '/admin/ai-knowledge' },
        { icon: 'bar-chart-2', label: 'AI analytics', route: '/admin/ai-analytics' },
        { icon: 'sliders', label: 'AI Assistant settings', route: '/admin/ai-settings', owner: true },
      ],
    },
    {
      title: 'Operations',
      items: [
        { icon: 'plus-circle', label: 'Log a job for a customer', route: '/admin/new-job' },
        { icon: 'calendar', label: 'Schedule & calendar events', route: '/admin/schedule' },
        { icon: 'package', label: 'Inventory & stock', route: '/admin/inventory', badge: k?.lowStockCount ? `${k.lowStockCount} LOW` : undefined },
        { icon: 'phone-missed', label: 'Missed calls & messages', route: '/admin/missed-calls', badge: k?.missedCallsToReview ? String(k.missedCallsToReview) : undefined },
      ],
    },
    {
      title: 'Finance',
      items: [
        { icon: 'file-text', label: 'Invoices & payments', route: '/admin/invoices', badge: k?.invoicesOutstanding ? String(k.invoicesOutstanding) : undefined },
        { icon: 'dollar-sign', label: 'Payroll', route: '/admin/payroll' },
        { icon: 'gift', label: 'Discounts & rewards offers', route: '/admin/discounts' },
        { icon: 'award', label: 'Compliance register (CoC)', route: '/admin/compliance' },
      ],
    },
    {
      title: 'People & catalogue',
      items: [
        { icon: 'users', label: 'Customers', route: '/admin/customers' },
        { icon: 'grid', label: 'Service types', route: '/admin/services' },
        { icon: 'user-check', label: 'Staff accounts', route: '/admin/staff', owner: true },
      ],
    },
    {
      title: 'Owner / manager',
      items: [
        { icon: 'bar-chart-2', label: 'Reports', route: '/admin/reports', owner: true },
        { icon: 'download', label: 'Data exports', route: '/admin/exports', owner: true },
        { icon: 'list', label: 'Audit log', route: '/admin/audit', owner: true },
        { icon: 'shield', label: 'POPIA data requests', route: '/admin/data-requests', owner: true },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: 'settings', label: owner ? 'Business settings & integrations' : 'Settings & integration status', route: '/admin/settings' },
        { icon: 'bell', label: 'Notifications', route: '/admin/notifications' },
        { icon: 'user', label: 'My profile & security', route: '/admin/profile' },
        { icon: 'globe', label: 'Public website content', route: '/home' },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="More" />
      <Screen onRefresh={() => void dash.refetch()} refreshing={dash.isRefetching}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ flexShrink: 1 }}>
            <Label color="primaryBright">{owner ? 'Owner / Manager' : 'Office admin'}</Label>
            <Text variant="h2">{user?.firstName} {user?.lastName}</Text>
          </View>
          {owner ? <Badge label="Owner privileges" icon="key" tone="secondary" mono={false} /> : null}
        </View>
        {groups.map((g) => {
          const items = g.items.filter((i) => !i.owner || owner);
          if (!items.length) return null;
          return (
            <View key={g.title} style={{ gap: spacing.sm }}>
              <Label>{g.title}</Label>
              {items.map((i) => <SegmentLink key={i.route} icon={i.icon} label={i.label} badge={i.badge} onPress={() => router.push(i.route as never)} />)}
            </View>
          );
        })}
        <Button label="Sign out" icon="log-out" variant="dangerOutline" testID="admin-sign-out" onPress={() => void (async () => {
          if (await confirm({ title: 'Sign out?', message: 'You will need to sign in again to access the operations centre.', confirmLabel: 'Sign out' })) {
            await useAuth.getState().signOut();
            router.replace('/');
          }
        })()} />
      </Screen>
    </View>
  );
}
