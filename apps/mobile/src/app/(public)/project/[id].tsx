import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useProject } from '../../../api/queries';
import { BrandHeader, DemoNote, Screen } from '../../../components/layout';
import { PhotoHeader, TestimonialCard } from '../../../components/marketing';
import { Badge, Button, Card, Icon, KeyValue, Label, Text, colors, spacing } from '../../../design-system';
import { monthYear } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

export default function CaseStudy() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useProject(id);
  const p = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Case Study" back />
      <Screen withTabBar={false} footer={<Button label="Request a Similar Project Quote" icon="file-text" onPress={() => router.navigate('/quote')} />}>
        {!p ? <QueryFallback query={q} count={2} /> : (
          <>
            <Card padded={false}>
              <PhotoHeader imageKey={p.imageKey} height={230} fallback="project-switchgear">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Badge label={p.category.replace('_', ' & ')} tone="neutral" solid />
                  {p.specBadge ? <Badge label={p.specBadge} tone="primary" solid /> : null}
                </View>
              </PhotoHeader>
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <Text variant="h1">{p.title}</Text>
                <KeyValue label="Client" value={p.clientName} />
                <KeyValue label="Location" value={p.location} />
                <KeyValue label="Completed" value={monthYear(p.completedDate)} mono />
                {p.accreditation ? <Badge label={p.accreditation} icon="shield" tone="secondary" mono={false} /> : null}
                <Text variant="body" color="textSecondary">{p.description}</Text>
              </View>
            </Card>
            <Card style={{ gap: spacing.md }}>
              <Label>Technical Highlights</Label>
              {p.highlights.map((h) => (
                <View key={h} style={{ flexDirection: 'row', gap: 10 }}>
                  <Icon name="check" size={16} color="primaryBright" />
                  <Text variant="mono" style={{ flex: 1 }}>{h}</Text>
                </View>
              ))}
            </Card>
            <TestimonialCard />
            <DemoNote show={p.isDemo} />
          </>
        )}
      </Screen>
    </View>
  );
}
