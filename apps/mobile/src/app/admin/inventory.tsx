/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { MaterialDto, StockMovementDto } from '@hydra/shared';
import { flatten, useMaterials, useMovements } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Button, Card, FilterChips, ProgressBar, SearchField, Segmented, Text, spacing } from '../../design-system';
import { fmtDateTime, money } from '../../utils/format';

type Filter = 'ALL' | 'LOW' | 'ARCHIVED';

/** Inventory (spec §10.6, PDF Story 10): stock levels, low-stock dashboard and the audited movement ledger. */
export default function Inventory() {
  const [tab, setTab] = useState<'ITEMS' | 'LEDGER'>('ITEMS');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const items = useMaterials({ search: search.trim() || undefined, lowStockOnly: filter === 'LOW' ? 'true' : undefined, includeArchived: filter === 'ARCHIVED' ? 'true' : undefined });
  const ledger = useMovements({});

  const header = (
    <>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'ITEMS', label: 'Stock items' }, { value: 'LEDGER', label: 'Movement ledger' }]} />
      {tab === 'ITEMS' ? (
        <>
          <Button label="Add material" icon="plus" size="sm" onPress={() => router.push('/admin/material/new')} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Search SKU or name…" />
          <FilterChips value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'Active' }, { value: 'LOW', label: 'Low stock', icon: 'alert-triangle' }, { value: 'ARCHIVED', label: 'Incl. archived' }]} />
        </>
      ) : null}
    </>
  );

  if (tab === 'LEDGER') {
    return (
      <AdminList<StockMovementDto>
        section="Inventory"
        header={header}
        items={flatten(ledger.data)}
        query={ledger}
        emptyIcon="list"
        emptyTitle="No stock movements yet"
        renderItem={({ item: m }) => (
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text variant="title" weight="bold" style={{ flex: 1 }} numberOfLines={2}>{m.materialName}</Text>
              <Text variant="mono" color={m.delta < 0 ? 'dangerBright' : 'success'}>{m.delta > 0 ? '+' : ''}{m.delta}</Text>
            </View>
            <Text variant="caption" color="textMuted">{m.reason.replace('_', ' ').toLowerCase()} · stock after {m.stockAfter}{m.jobReference ? ` · job ${m.jobReference}` : ''}</Text>
            <Text variant="caption" color="textFaint">{m.actorName} · {fmtDateTime(m.createdAt)}{m.note ? ` · ${m.note}` : ''}</Text>
          </Card>
        )}
      />
    );
  }

  return (
    <AdminList<MaterialDto>
      section="Inventory"
      header={header}
      items={flatten(items.data)}
      query={items}
      emptyIcon="package"
      emptyTitle={filter === 'LOW' ? 'Nothing is low on stock' : 'No materials found'}
      renderItem={({ item: m }) => (
        <Card onPress={() => router.push(`/admin/material/${m.id}`)} accent={m.isLowStock && !m.isArchived ? 'danger' : 'none'} accessibilityLabel={`${m.name}, ${m.stockLevel} ${m.unit}${m.isLowStock ? ', low stock' : ''}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="mono" color="textMuted" style={{ fontSize: 12 }}>{m.sku}</Text>
            {m.isArchived ? <Badge label="ARCHIVED" /> : m.isLowStock ? <Badge label="LOW STOCK" tone="danger" icon="alert-triangle" /> : <Badge label="IN STOCK" tone="success" />}
          </View>
          <Text variant="title" weight="bold">{m.name}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodySmall" color={m.isLowStock ? 'dangerBright' : 'text'}>{m.stockLevel} {m.unit} <Text variant="caption" color="textMuted">/ reorder at {m.reorderLevel}</Text></Text>
            <Text variant="mono">{money(m.unitCost)}</Text>
          </View>
          <ProgressBar value={m.reorderLevel > 0 ? Math.min(1, m.stockLevel / (m.reorderLevel * 3)) : 1} />
        </Card>
      )}
    />
  );
}
