import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Label, Text, colors, radius, spacing } from '../design-system';
import { KEYBOARD_BEHAVIOR } from './layout';

/** Branded shell for sign-in / registration flows. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.xl, width: '100%', maxWidth: 560, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="auth-back" style={{ alignSelf: 'flex-start' }}>
          <Icon name="arrow-left" size={22} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.logo}><Icon name="zap" size={24} color="white" /></View>
          <View style={{ flex: 1 }}>
            <Text variant="h3">PSG Electrical</Text>
            <Label>& Cables · Trite Solar</Label>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="h1" accessibilityRole="header">{title}</Text>
          <Text variant="body" color="textMuted">{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
