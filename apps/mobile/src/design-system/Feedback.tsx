import { useEffect, useState, type ReactNode } from 'react';
import { Animated, LayoutAnimation, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radius, spacing } from './tokens';

export function EmptyState({ icon = 'inbox', title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.center} accessible accessibilityLabel={`${title}. ${message ?? ''}`}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color="primaryBright" />
      </View>
      <Text variant="h3" align="center">{title}</Text>
      {message ? <Text variant="bodySmall" color="textMuted" align="center">{message}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerMuted }]}>
        <Icon name="alert-triangle" size={24} color="dangerBright" />
      </View>
      <Text variant="h3" align="center">We couldn’t load this</Text>
      <Text variant="bodySmall" color="textMuted" align="center">{message}</Text>
      {onRetry ? <Button label="Try again" icon="refresh-cw" variant="secondary" onPress={onRetry} fullWidth={false} /> : null}
    </View>
  );
}

/** The native animation driver does not exist on web; react-native-web would warn and fall back. */
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Pulsing placeholder blocks used while data loads. */
export function Skeleton({ height = 16, width = '100%', radius: r = radius.sm }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const [opacity] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ height, width, borderRadius: r, backgroundColor: colors.surfaceElevated, opacity }} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton height={14} width="40%" />
          <Skeleton height={20} width="80%" />
          <Skeleton height={14} width="60%" />
        </View>
      ))}
    </View>
  );
}

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'secondary' }) {
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: tone === 'primary' ? colors.primary : colors.secondary }]} />
    </View>
  );
}

/** Expandable FAQ row. */
export function Accordion({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.accordion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen(!open);
        }}
        style={styles.accordionHead}
      >
        <Text variant="title" weight="bold" style={{ flex: 1 }}>{title}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textSecondary" />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>{typeof children === 'string' ? <Text variant="bodySmall" color="textMuted">{children}</Text> : children}</View> : null}
    </View>
  );
}

// ---- Toasts --------------------------------------------------------------------------------------
type ToastTone = 'success' | 'error' | 'info';
interface ToastState {
  message: string | null;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => set({ message, tone }),
  hide: () => set({ message: null }),
}));

export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};

export function ToastHost() {
  const { message, tone, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3500);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  const icon: IconName = tone === 'success' ? 'check-circle' : tone === 'error' ? 'alert-circle' : 'info';
  return (
    <Pressable onPress={hide} style={[styles.toast, { top: insets.top + 8, borderColor: tone === 'error' ? colors.dangerBright : tone === 'success' ? colors.success : colors.primaryBorder }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Icon name={icon} size={18} color={tone === 'error' ? 'dangerBright' : tone === 'success' ? 'success' : 'primaryBright'} />
      <Text variant="bodySmall" style={{ flex: 1 }}>{message}</Text>
    </Pressable>
  );
}

// ---- Confirmation dialog (branded, replaces native alerts for destructive actions) -------------
interface ConfirmState {
  request: null | { title: string; message: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void };
}
const useConfirmStore = create<ConfirmState>(() => ({ request: null }));

export function confirm(opts: { title: string; message: string; confirmLabel?: string; destructive?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ request: { title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'Confirm', destructive: !!opts.destructive, resolve } });
  });
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.request);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    useConfirmStore.setState({ request: null });
  };
  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.dialogWrap}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text variant="h3">{req?.title}</Text>
          <Text variant="bodySmall" color="textMuted">{req?.message}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
            <Button label="Cancel" variant="secondary" onPress={() => close(false)} style={{ flex: 1 }} />
            <Button label={req?.confirmLabel ?? 'Confirm'} variant={req?.destructive ? 'danger' : 'primary'} onPress={() => close(true)} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  skeletonCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 10 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  accordion: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  accordionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: 52 },
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 1000, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, padding: 14 },
  dialogWrap: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.md },
});
