import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { flatten, useCustomers } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Card, SearchField, Text, spacing } from '../../design-system';
import { money } from '../../utils/format';

/** Customer directory (spec §5.4 “view all customers”). */
export default function Customers() {
  const [search, setSearch] = useState('');
  const q = useCustomers(search.trim() || undefined);
  return (
    <AdminList
      section="Customers"
      items={flatten(q.data)}
      query={q}
      emptyIcon="users"
      emptyTitle={search ? 'No matching customers' : 'No customers yet'}
      header={<SearchField value={search} onChangeText={setSearch} placeholder="Search name, email or phone…" />}
      renderItem={({ item: c }) => (
        <Card onPress={() => router.push(`/admin/customer/${c.id}`)} accessibilityLabel={`${c.firstName} ${c.lastName}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="title" weight="bold" style={{ flex: 1 }}>{c.firstName} {c.lastName}</Text>
            {c.status === 'DISABLED' ? <Badge label="DISABLED" tone="danger" /> : c.outstandingBalance > 0 ? <Badge label={`${money(c.outstandingBalance)} DUE`} tone="warning" /> : null}
          </View>
          <Text variant="caption" color="textMuted">{c.email}{c.phone ? ` · ${c.phone}` : ''}</Text>
          <Text variant="caption" color="textSecondary">{c.jobCount} job{c.jobCount === 1 ? '' : 's'} · {c.pointsBalance} reward points</Text>
        </Card>
      )}
    />
  );
}
