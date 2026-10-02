import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFaqs, usePublicContent } from '../../api/queries';
import { imageFor, type ImageKey } from '../../components/images';
import { BrandHeader, DemoNote, Screen } from '../../components/layout';
import { Accordion, Badge, Button, Card, Icon, Label, Segmented, Text, colors, radius, spacing } from '../../design-system';
import { callNumber } from '../../utils/links';

const PILLARS: { tag: string; tone: 'primary' | 'secondary'; title: string; body: string; image: ImageKey; points: string[] }[] = [
  { tag: 'ISO 9001:2015', tone: 'primary', title: 'Uncompromising Safety', image: 'pillar-iso', body: 'Strict adherence to SANS 10142-1 regulations with zero-harm safety records across all high-voltage sites.', points: ['Registered Master Electrician Supervision', 'R50 Million Public & Site Insurance', 'Full Compliance Testing & CoC Issuance'] },
  { tag: '15+ YEARS TRACK RECORD', tone: 'secondary', title: 'Industrial Expertise', image: 'pillar-years', body: 'Over 450 heavy-industrial substations, commercial solar microgrids, and data center cabling infrastructure projects.', points: ['In-House Certified Systems Engineers', 'Precision High-Voltage Diagnostic Tooling', 'Turnaround Guarantees on Heavy Infrastructure'] },
  { tag: '24/7 SLA DISPATCH', tone: 'primary', title: 'Rapid Emergency Response', image: 'pillar-clock', body: 'Guaranteed 60-minute dispatch SLA for critical plant outages, switchgear failures, and power disruptions.', points: ['Fully Stocked Mobile Field Response Units', 'Live Telemetry & Field Crew Tracking', 'Dedicated Emergency Hotline Priority'] },
];

const COMPARE = [
  { label: 'ENGINEERING STAFF', psg: '100% In-house certified engineers', std: 'Subcontracted unverified staff' },
  { label: 'DIAGNOSTIC EQUIPMENT', psg: 'Calibrated thermal & digital gear', std: 'Basic visual check tools only' },
  { label: 'DISPATCH SLA', psg: 'Guaranteed <60 min dispatch', std: 'Standard 24–48h callback' },
  { label: 'WARRANTY & COC', psg: '36-Month Warranty + Instant CoC', std: 'Limited 6-month coverage' },
];

export default function WhyPsgScreen() {
  const content = usePublicContent();
  const faqs = useFaqs('COMPLIANCE');
  const [side, setSide] = useState<'PSG' | 'STD'>('PSG');
  const metrics = content.data?.metrics.filter((m) => m.group === 'why') ?? [];
  const accreditations = content.data?.accreditations ?? [];
  const main = accreditations[0];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Why Choose Us" back />
      <Screen withTabBar={false}>
        <Card style={{ gap: spacing.md }}>
          <Badge label="THE PSG STANDARD" icon="shield" tone="primary" />
          <Text variant="h1">Built on Precision, Safety & Proven Execution</Text>
          <Text variant="body" color="textMuted">South Africa’s leading industrial plants, commercial trusts, and energy facilities rely on PSG Electrical for zero-downtime installations and compliance excellence.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {metrics.map((m) => (
              <View key={m.key} style={styles.metric}>
                <Text variant="h2" color={m.accent === 'primary' ? 'primaryBright' : m.accent === 'secondary' ? 'secondaryBright' : 'text'}>{m.value}</Text>
                <Label>{m.label}</Label>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.between}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="shield" size={18} color="primaryBright" /><Text variant="h3">Core Credibility Pillars</Text></View>
          <Badge label="3 GUARANTEES" tone="neutral" />
        </View>
        {PILLARS.map((p) => (
          <Card key={p.title} style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Image source={imageFor(p.image)} style={styles.pillarImg} contentFit="cover" accessibilityIgnoresInvertColors />
              <View style={{ flex: 1, gap: 6 }}>
                <Badge label={p.tag} tone={p.tone} />
                <Text variant="h3">{p.title}</Text>
                <Text variant="bodySmall" color="textMuted">{p.body}</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.md, gap: 8 }}>
              {p.points.map((pt) => (
                <View key={pt} style={{ flexDirection: 'row', gap: 8 }}>
                  <Icon name="check" size={15} color={p.tone === 'primary' ? 'primaryBright' : 'secondaryBright'} />
                  <Text variant="bodySmall" style={{ flex: 1 }}>{pt}</Text>
                </View>
              ))}
            </View>
          </Card>
        ))}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="trending-up" size={18} color="primaryBright" /><Text variant="h3">Why We Stand Out</Text></View>
        <Card style={{ gap: spacing.md }}>
          <Segmented value={side} onChange={setSide} options={[{ value: 'PSG', label: 'PSG Electrical' }, { value: 'STD', label: 'Standard Contractors' }]} />
          {COMPARE.map((c) => (
            <View key={c.label} style={{ gap: 6 }}>
              <Label>{c.label}</Label>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={[styles.cmp, side === 'PSG' ? { borderColor: colors.primaryBorder } : { opacity: 0.55 }]}>
                  <Icon name="check-circle" size={15} color="primaryBright" />
                  <Text variant="bodySmall" weight="semibold" style={{ flex: 1 }}>{c.psg}</Text>
                </View>
                <View style={[styles.cmp, side === 'STD' ? { borderColor: 'rgba(227,24,55,0.5)' } : { opacity: 0.55 }]}>
                  <Icon name="x-circle" size={15} color="dangerBright" />
                  <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>{c.std}</Text>
                </View>
              </View>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="award" size={18} color="secondaryBright" /><Text variant="h3">Official Accreditations</Text></View>
        <View style={styles.accGrid}>
          {accreditations.map((a, i) => (
            <View key={a.code} style={[styles.acc, i === 0 ? { borderColor: colors.primaryBright } : null]}>
              <View style={styles.between}>
                <Label color={a.accent === 'primary' ? 'primaryBright' : 'secondaryBright'} style={{ fontSize: 12 }}>{a.code}</Label>
                {i === 0 ? <Icon name="check" size={14} color="primaryBright" /> : null}
              </View>
              <Text variant="title" weight="bold">{a.title}</Text>
            </View>
          ))}
        </View>
        {main ? (
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.between}>
              <Badge label="REGISTRATION # SA-9001-2023" tone="primary" />
              <Label>Audited Annually</Label>
            </View>
            <Text variant="h3">ISO 9001:2015 Quality Management</Text>
            <Text variant="bodySmall" color="textMuted">{main.caption}</Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="help-circle" size={18} color="primaryBright" /><Text variant="h3">Compliance & Safety FAQ</Text></View>
        {(faqs.data ?? []).map((f, i) => <Accordion key={f.id} title={f.question} defaultOpen={i === 0}>{f.answer}</Accordion>)}

        <Card accent="primary" style={{ gap: spacing.md }}>
          <Badge label="PARTNER WITH PSG" tone="primary" />
          <Text variant="h1" style={{ fontSize: 22 }}>Need Guaranteed Electrical Compliance?</Text>
          <Text variant="bodySmall" color="textMuted">Contact our engineering team today for an immediate site audit, project quote, or emergency dispatch.</Text>
          <Button label="Request Project Quotation" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
          <Button label="24/7 Emergency Dispatch" icon="phone-call" variant="dangerOutline" onPress={() => content.data && void callNumber(content.data.company.emergencyLine)} />
        </Card>
        <DemoNote show={content.data?.isDemoContent} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  metric: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  pillarImg: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  cmp: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
  accGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  acc: { width: '48.5%', flexGrow: 1, gap: 4, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
});
