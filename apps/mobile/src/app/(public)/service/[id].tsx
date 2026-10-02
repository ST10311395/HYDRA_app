import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useService } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { EmergencyCta, PhotoHeader } from '../../../components/marketing';
import { Badge, Button, Card, Icon, KeyValue, Label, Text, colors, spacing } from '../../../design-system';
import { money } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useService(id);
  const s = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Service Specification" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
        footer={s ? <Button label="Request Quote for this Service" iconRight="arrow-right" onPress={() => router.navigate({ pathname: '/quote', params: { serviceTypeId: s.id } })} /> : undefined}>
        {!s ? <QueryFallback query={q} count={2} /> : (
          <>
            <Card padded={false}>
              <PhotoHeader imageKey={s.imageKey} height={180}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {s.badge ? <Badge label={s.badge} tone="primary" solid mono={false} /> : <View />}
                </View>
                {s.slaText ? <Badge label={s.slaText} icon="clock" tone="neutral" solid mono={false} /> : null}
              </PhotoHeader>
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <Text variant="h1">{s.name}</Text>
                <Text variant="body" color="textMuted">{s.description}</Text>
                <KeyValue label="Call-out / starting from" value={money(s.basePrice)} valueColor="primaryBright" mono />
                <Text variant="caption" color="textFaint">Final pricing is confirmed in an engineer-reviewed quotation after scoping.</Text>
              </View>
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Technical Specifications</Label>
              {s.specs.map((sp) => <KeyValue key={sp.label} label={sp.label} value={sp.value} />)}
            </Card>
            <Card style={{ gap: spacing.md }}>
              <Label>Technical Scope & Features</Label>
              {s.features.map((f) => (
                <View key={f} style={{ flexDirection: 'row', gap: 10 }}>
                  <Icon name="check-circle" size={16} color="primaryBright" />
                  <Text variant="body" style={{ flex: 1 }}>{f}</Text>
                </View>
              ))}
            </Card>
            <EmergencyCta />
          </>
        )}
      </Screen>
    </View>
  );
}
