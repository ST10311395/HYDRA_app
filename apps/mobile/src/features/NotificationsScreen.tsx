/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { flatten, useMarkNotification, useNotifications } from '../api/queries';
import { BrandHeader } from '../components/layout';
import { Button, EmptyState, Icon, Text, colors, radius, spacing, type IconName } from '../design-system';
import { routeForNotification } from '../navigation/notificationRoutes';
import { useAuth } from '../store/auth';
import { fmtRelative } from '../utils/format';
import { QueryFallback, notReady } from '../components/QueryState';

const ICON: Record<string, IconName> = {
  QUOTE_READY: 'file-text', QUOTE_ACCEPTED: 'check-circle', QUOTE_DECLINED: 'x-circle', JOB_ASSIGNED: 'briefcase', JOB_SCHEDULED: 'calendar',
  JOB_REASSIGNED: 'repeat', CHECKED_IN: 'map-pin', MILESTONE_UPDATED: 'flag', JOB_COMPLETED: 'award', INSPECTION_SUBMITTED: 'clipboard',
  INVOICE_ISSUED: 'file', INVOICE_OVERDUE: 'alert-circle', PAYMENT_CONFIRMED: 'credit-card', PAYMENT_RECEIVED: 'dollar-sign', REWARDS_CREDITED: 'gift',
  LEAVE_REQUESTED: 'sun', LEAVE_DECIDED: 'sun', SCHEDULE_CHANGED: 'clock', NEW_ENQUIRY: 'inbox', NEW_JOB_REQUEST: 'plus-circle', LOW_STOCK: 'package',
  MISSED_CALL_REVIEW: 'phone-missed', MESSAGE_FAILED: 'alert-triangle', ADMIN_NOTE: 'message-square', SYSTEM: 'bell',
};

export function NotificationsScreen() {
  const role = useAuth((s) => s.user?.role);
  const q = useNotifications();
  const mark = useMarkNotification();
  const items = flatten(q.data);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Notifications" back />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 }}
        ListHeaderComponent={items.some((n) => !n.readAt) ? <Button label="Mark all as read" variant="ghost" icon="check" onPress={() => mark.mutate('all')} /> : null}
        renderItem={({ item: n }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}. ${n.body}`}
            onPress={() => {
              if (!n.readAt) mark.mutate(n.id);
              const route = routeForNotification(role, n.data);
              if (route) router.push(route as never);
            }}
            style={[styles.row, !n.readAt ? { borderColor: colors.primaryBorder, backgroundColor: '#131B2A' } : null]}
          >
            <View style={styles.icon}><Icon name={ICON[n.type] ?? 'bell'} size={18} color={n.readAt ? 'textMuted' : 'primaryBright'} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title" weight={n.readAt ? 'medium' : 'bold'}>{n.title}</Text>
              <Text variant="bodySmall" color="textMuted">{n.body}</Text>
              <Text variant="caption" color="textFaint">{fmtRelative(n.createdAt)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="bell" title="No notifications" message="Updates about your jobs will appear here." />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
});
