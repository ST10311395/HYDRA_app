/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROLE_LABELS, type Paginated } from '@hydra/shared';
import { api } from '../api/client';
import { usePublicContent } from '../api/queries';
import { Button, Icon, IconButton, Text, colors, confirm, radius, spacing, type IconName } from '../design-system';
import { homeForRole, useAuth } from '../store/auth';
import { useNetwork } from '../hooks/useNetwork';
import { callNumber } from '../utils/links';

export const TAB_BAR_HEIGHT = 64;

/**
 * Keyboard handling for forms. Android apps are edge-to-edge (SDK 54+), so the window no longer
 * resizes for the keyboard and both platforms need padding; the browser handles it natively.
 * Tapping empty space dismisses the keyboard (`keyboardShouldPersistTaps="handled"`), dragging
 * the page dismisses it too, and focused fields scroll into view above the keyboard.
 */
export const KEYBOARD_BEHAVIOR = Platform.OS === 'web' ? undefined : 'padding';

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  padded = true,
  contentStyle,
  withTabBar = true,
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  withTabBar?: boolean;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottom = (withTabBar ? spacing.xl : insets.bottom + spacing.xl) + (footer ? 80 : 0);
  const content = [padded ? { padding: spacing.lg, gap: spacing.lg } : null, { paddingBottom: bottom }, contentStyle];
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryBright} colors={[colors.primary]} progressBackgroundColor={colors.surface} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, ...content]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: (withTabBar ? spacing.md : insets.bottom + spacing.md) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

function OfflineBanner() {
  const online = useNetwork();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Icon name="wifi-off" size={14} color="warning" />
      <Text variant="caption" color="warning">Offline — showing saved data. Changes need a connection.</Text>
    </View>
  );
}

export function useUnreadCount(): number {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const q = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<Paginated<unknown> & { unread: number }>('/notifications', { unreadOnly: true, pageSize: 1 }),
    enabled: signedIn,
    refetchInterval: 120_000,
  });
  return q.data?.unread ?? 0;
}

const ROLE_AREA = {
  CUSTOMER: { base: '/customer', dashboard: 'My dashboard' },
  EMPLOYEE: { base: '/employee', dashboard: 'My workday' },
  ADMIN_OFFICE: { base: '/admin', dashboard: 'Operations centre' },
  ADMIN_OWNER: { base: '/admin', dashboard: 'Operations centre (owner)' },
} as const;

/** Below this width the Emergency action collapses to its icon so the brand never truncates. */
const COMPACT_HEADER_WIDTH = 410;

const initialsOf = (u: { firstName: string; lastName: string }) => `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase();

/**
 * Brand header from the wireframes: PSG Electrical mark, Emergency CTA, call and the account /
 * notifications action, then a “Portal › Section” breadcrumb with the ISO 9001 chip and a blue rule.
 */
export function BrandHeader({ section, back }: { section: string; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_HEADER_WIDTH;
  const content = usePublicContent();
  const user = useAuth((s) => s.user);
  const unread = useUnreadCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const hotline = content.data?.company.hotline;
  const emergency = content.data?.company.emergencyLine ?? hotline;
  return (
    <View style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={[styles.brandRow, compact ? { paddingHorizontal: spacing.md, gap: 6 } : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={user ? 'PSG Electrical — my home screen' : 'PSG Electrical home'}
          onPress={() => router.navigate(user ? homeForRole(user.role) : '/home')}
          style={styles.brand}
        >
          <View style={[styles.logo, compact ? { width: 38, height: 38 } : null]}>
            <Icon name="zap" size={compact ? 18 : 20} color="white" />
            <View style={styles.logoDot} />
          </View>
          <View style={styles.brandText}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="h3" style={{ fontSize: compact ? 15 : 16, lineHeight: compact ? 19 : 21, flexShrink: 1 }} numberOfLines={2}>PSG Electrical</Text>
              {!compact ? <View style={styles.pro}><Text variant="caption" color="textMuted" style={{ fontSize: 10 }}>PRO</Text></View> : null}
            </View>
            <Text variant="caption" color="textMuted" style={{ fontSize: compact ? 11 : 12, lineHeight: compact ? 14 : 16 }} numberOfLines={2}>& Cables · South Africa</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Emergency: call the 24/7 line"
          disabled={!emergency}
          onPress={() => emergency && void callNumber(emergency)}
          style={({ pressed }) => [styles.emergency, compact ? styles.emergencyCompact : null, { opacity: pressed ? 0.85 : 1 }]}
          testID="header-emergency"
        >
          <Icon name="shield" size={compact ? 17 : 15} color="white" />
          {!compact ? <Text variant="caption" weight="bold" color="white" style={{ fontSize: 13 }}>Emergency</Text> : null}
        </Pressable>
        <IconButton icon="phone-call" label="Call PSG Electrical" size={compact ? 38 : 40} onPress={() => hotline && void callNumber(hotline)} />
        <AccountButton size={compact ? 38 : 40} unread={unread} onPress={() => setMenuOpen(true)} />
      </View>
      <View style={[styles.crumbRow, compact ? { paddingHorizontal: spacing.md } : null]}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} style={{ marginRight: 8 }}>
            <Icon name="arrow-left" size={18} color="textSecondary" />
          </Pressable>
        ) : null}
        <Text variant="bodySmall" color="textMuted">Portal</Text>
        <Icon name="chevron-right" size={14} color="textMuted" />
        <Text variant="title" weight="bold" numberOfLines={2} style={{ flex: 1 }} accessibilityRole="header">{section}</Text>
        <View style={styles.iso}>
          <Icon name="check-circle" size={12} color="secondaryBright" />
          <Text variant="caption" weight="bold" style={{ fontSize: 12 }}>ISO 9001</Text>
        </View>
      </View>
      <View style={styles.rule} />
      <AccountMenu visible={menuOpen} unread={unread} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

function AccountButton({ size, unread, onPress }: { size: number; unread: number; onPress: () => void }) {
  const user = useAuth((s) => s.user);
  if (!user) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Account: sign in or create an account" onPress={onPress} hitSlop={4} style={[styles.account, { height: size, width: size }]} testID="header-account">
        <Icon name="user" size={18} color="text" />
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Account menu for ${user.firstName}${unread ? `, ${unread} unread notifications` : ''}`}
      onPress={onPress}
      hitSlop={4}
      style={[styles.avatar, { height: size, width: size }]}
      testID="header-account"
    >
      <Text variant="caption" weight="bold" color="white">{initialsOf(user)}</Text>
      {unread > 0 ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

/** Account sheet: sign-in / register for guests; dashboard, notifications, profile and sign-out for users. */
function AccountMenu({ visible, unread, onClose }: { visible: boolean; unread: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };
  const area = user ? ROLE_AREA[user.role] : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close account menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.grabber} />
        {user && area ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={[styles.avatar, { width: 44, height: 44 }]}>
                <Text variant="title" weight="bold" color="white">{initialsOf(user)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{user.firstName} {user.lastName}</Text>
                <Text variant="caption" color="textMuted">{ROLE_LABELS[user.role]} · {user.email}</Text>
              </View>
            </View>
            <MenuItem icon="grid" label={area.dashboard} onPress={() => go(area.base)} testID="menu-dashboard" />
            <MenuItem icon="bell" label="Notifications" badge={unread ? String(unread) : undefined} onPress={() => go(`${area.base}/notifications`)} />
            <MenuItem icon="user" label="Profile & settings" onPress={() => go(`${area.base}/profile`)} />
            <MenuItem icon="globe" label="PSG Electrical website" onPress={() => go('/home')} />
            <MenuItem
              icon="log-out"
              label="Sign out"
              danger
              testID="menu-sign-out"
              onPress={() => {
                onClose();
                void (async () => {
                  if (await confirm({ title: 'Sign out?', message: 'You will need to sign in again to access your account.', confirmLabel: 'Sign out' })) {
                    await useAuth.getState().signOut();
                    router.replace('/');
                  }
                })();
              }}
            />
          </>
        ) : (
          <>
            <Text variant="h3">Your PSG Electrical account</Text>
            <Text variant="bodySmall" color="textMuted">Sign in to request services, approve quotes, track your electrician live, pay invoices and earn rewards.</Text>
            <Button label="Sign In" icon="log-in" onPress={() => go('/login')} testID="menu-sign-in" />
            <Button label="Create Account" icon="user-plus" variant="secondary" onPress={() => go('/register')} testID="menu-register" />
            <Button label="Staff sign in" icon="briefcase" variant="ghost" size="sm" onPress={() => go('/login?audience=staff')} />
          </>
        )}
      </View>
    </Modal>
  );
}

function MenuItem({ icon, label, onPress, badge, danger, testID }: { icon: IconName; label: string; onPress: () => void; badge?: string; danger?: boolean; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label} onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed ? { opacity: 0.8 } : null]} testID={testID}>
      <Icon name={icon} size={18} color={danger ? 'dangerBright' : 'textSecondary'} />
      <Text variant="title" color={danger ? 'dangerBright' : 'text'} style={{ flex: 1 }}>{label}</Text>
      {badge ? <View style={styles.menuBadge}><Text variant="caption" weight="bold" color="white">{badge}</Text></View> : null}
      {!danger ? <Icon name="chevron-right" size={16} color="textMuted" /> : null}
    </Pressable>
  );
}

/** Small note shown when content is seeded demo data awaiting client verification (spec §7.4). */
export function DemoNote({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <Text variant="caption" color="textFaint" align="center" style={{ marginTop: spacing.sm }}>
      Illustrative content — pending verification by PSG Electrical & Cables.
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  brandText: { flex: 1, minWidth: 0 },
  logo: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  logoDot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryBright, borderWidth: 2, borderColor: colors.background },
  pro: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 5 },
  emergency: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 12, height: 40 },
  emergencyCompact: { paddingHorizontal: 0, width: 38, height: 38, justifyContent: 'center' },
  account: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  avatar: { borderRadius: radius.pill, backgroundColor: colors.primary, borderColor: colors.primaryBorder, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: -1, right: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.dangerBright, borderWidth: 2, borderColor: colors.background },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  menuBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  crumbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.surface },
  iso: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.backgroundDeep, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  rule: { height: 2, backgroundColor: colors.primary, opacity: 0.85 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  offline: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: colors.warningMuted },
});
