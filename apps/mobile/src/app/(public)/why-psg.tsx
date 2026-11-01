/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useFaqs, usePublicContent } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { QualityCard } from '../../components/marketing';
import { PSG_CONTACT } from '../../content/company';
import { Accordion, Badge, Button, Card, Icon, Label, Text, colors, radius, spacing } from '../../design-system';
import { callNumber } from '../../utils/links';

/** “Why pick us?” and vision / mission, taken from the PSG company portfolio (Part 3). */
const REASONS = [
  'Proven experience in commercial and industrial environments',
  'Strong focus on safety and compliance',
  'Reliable maintenance and fault response services',
  'Experience in hazardous and high-risk installations',
  'Scalable solutions for multi-site and growing businesses',
];

const VISION = 'To be a leading provider of electrical and cable management solutions, recognised for reliability, quality workmanship, and consistent delivery across the commercial and industrial sectors.';
const MISSION = 'To deliver safe, compliant, and high-quality electrical installations, provide efficient and practical solutions tailored to each client, and maintain strong, long-term client relationships.';

export default function WhyPsgScreen() {
  const content = usePublicContent();
  const faqs = useFaqs('COMPLIANCE');
  // Accreditations are shown only once the business has published verified, non-demo entries.
  const accreditations = content.data?.isDemoContent === false ? content.data.accreditations : [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Why Choose Us" back />
      <Screen withTabBar={false}>
        <Card style={{ gap: spacing.md }}>
          <Badge label="About PSG" icon="home" tone="primary" mono={false} />
          <Text variant="h1">Why choose PSG Electrical & Cables</Text>
          <Text variant="body" color="textMuted">
            PSG Electrical & Cables provides electrical infrastructure and cable management solutions across industrial, logistics, commercial and institutional sectors. We support clients operating in high-demand environments, where reliability, safety and compliance are critical.
          </Text>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="check-circle" size={18} color="primaryBright" /><Text variant="h3">Why pick us?</Text></View>
          {REASONS.map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="check" size={16} color="primaryBright" />
              <Text variant="body" style={{ flex: 1 }}>{r}</Text>
            </View>
          ))}
        </Card>

        <View style={styles.pair}>
          <Card style={styles.half}>
            <Label color="primaryBright">Our vision</Label>
            <Text variant="bodySmall" color="textSecondary">{VISION}</Text>
          </Card>
          <Card style={styles.half}>
            <Label color="secondaryBright">Our mission</Label>
            <Text variant="bodySmall" color="textSecondary">{MISSION}</Text>
          </Card>
        </View>

        <QualityCard />

        {accreditations.length ? (
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="award" size={18} color="secondaryBright" /><Text variant="h3">Accreditations</Text></View>
            {accreditations.map((a) => (
              <View key={a.code} style={styles.acc}>
                <Label color={a.accent === 'primary' ? 'primaryBright' : 'secondaryBright'}>{a.code}</Label>
                <Text variant="title" weight="bold">{a.title}</Text>
                {a.caption ? <Text variant="caption" color="textMuted">{a.caption}</Text> : null}
              </View>
            ))}
          </Card>
        ) : null}

        {(faqs.data ?? []).length ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="help-circle" size={18} color="primaryBright" /><Text variant="h3">Compliance & safety FAQ</Text></View>
            {(faqs.data ?? []).map((f, i) => <Accordion key={f.id} title={f.question} defaultOpen={i === 0}>{f.answer}</Accordion>)}
          </>
        ) : null}

        <Card accent="primary" style={{ gap: spacing.md }}>
          <Text variant="h2">Ready to talk about your project?</Text>
          <Text variant="bodySmall" color="textMuted">Request a quotation or call us during office hours ({PSG_CONTACT.hours}).</Text>
          <Button label="Request a quote" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
          <Button label={`Call ${PSG_CONTACT.primaryPhone}`} icon="phone-call" variant="secondary" onPress={() => void callNumber(PSG_CONTACT.primaryPhone)} />
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  half: { flexGrow: 1, flexBasis: 260, gap: spacing.sm },
  acc: { gap: 2, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
});
