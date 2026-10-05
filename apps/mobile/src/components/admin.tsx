/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, RefreshControl, View, type ListRenderItem } from 'react-native';
import { Button, EmptyState, colors, spacing, type IconName } from '../design-system';
import { useAuth } from '../store/auth';
import { BrandHeader, Screen } from './layout';
import { QueryFallback, notReady, type QueryLike } from './QueryState';

export const useIsOwner = () => useAuth((s) => s.user?.role === 'ADMIN_OWNER');

/**
 * Client-side presentation guard for owner-only modules. The API independently enforces the
 * ADMIN_OWNER role on every one of these endpoints (spec §10.10 / §14.21) — this only avoids
 * showing office staff a screen they cannot use.
 */
export function OwnerGate({ section, children }: { section: string; children: ReactNode }) {
  const owner = useIsOwner();
  if (owner) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={section} back />
      <Screen withTabBar={false}>
        <EmptyState
          icon="lock"
          title="Owner / manager access only"
          message="This module is restricted to the business owner. Ask the owner if you need this information."
          action={<Button label="Back" variant="secondary" fullWidth={false} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/admin'))} />}
        />
      </Screen>
    </View>
  );
}

interface PagedQuery extends QueryLike {
  data?: unknown;
  isRefetching: boolean;
  hasNextPage?: boolean;
  refetch: () => unknown;
  fetchNextPage?: () => unknown;
}

/** Standard admin list page: branded header, header content, paginated list with loading/empty/error states. */
export function AdminList<T extends { id: string }>({
  section,
  header,
  items,
  query,
  renderItem,
  emptyIcon = 'inbox',
  emptyTitle,
  emptyMessage,
  back = true,
}: {
  section: string;
  header?: ReactNode;
  items: T[];
  query: PagedQuery;
  renderItem: ListRenderItem<T>;
  emptyIcon?: IconName;
  emptyTitle: string;
  emptyMessage?: string;
  back?: boolean;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={section} back={back} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
        ListHeaderComponent={header ? <View style={{ gap: spacing.md }}>{header}</View> : null}
        renderItem={renderItem}
        ListEmptyComponent={notReady(query) ? <QueryFallback query={query} /> : <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />}
        onEndReached={() => query.hasNextPage && void query.fetchNextPage?.()}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}

/** Parse a user-typed decimal ("1 250,50" / "1250.5") into a number, or NaN. */
export function parseAmount(v: string): number {
  const cleaned = v.replace(/\s/g, '').replace(',', '.');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}
