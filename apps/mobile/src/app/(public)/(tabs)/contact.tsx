/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { email as emailSchema, phone as phoneSchema, type JobUrgency } from '@hydra/shared';
import { ApiError, errorMessage } from '../../../api/client';
import { useDepartments, useFaqs, useOffices, usePublicContent, useSubmitEnquiry } from '../../../api/queries';
import { imageFor } from '../../../components/images';
import { BrandHeader, DemoNote, Screen } from '../../../components/layout';
import { Accordion, Badge, Button, Card, Checkbox, FilterChips, Icon, Label, SelectField, Segmented, Text, TextField, colors, radius, spacing, toast, type IconName } from '../../../design-system';
import { useAuth } from '../../../store/auth';
import { callNumber, openDirections, openWhatsApp, sendEmail } from '../../../utils/links';

const SECTORS = ['Industrial High Voltage Substation', 'Commercial Building', 'Solar & Energy Storage', 'Fiber & Data Cabling', 'Residential', 'Certificate of Compliance', 'Other'].map((v) => ({ value: v, label: v }));
const DEPT_ICON: Record<string, IconName> = { zap: 'zap', sparkles: 'star', 'shield-check': 'shield', siren: 'alert-octagon' };

export default function ContactScreen() {
  const content = usePublicContent();
  const offices = useOffices();
  const departments = useDepartments();
  const faqs = useFaqs('CONTACT');
  const submit = useSubmitEnquiry();
  const user = useAuth((s) => s.user);
  const [region, setRegion] = useState<string>('');
  const [form, setForm] = useState({ name: user ? `${user.firstName} ${user.lastName}` : '', email: user?.email ?? '', phone: user?.phone ?? '', sector: SECTORS[0]!.value, urgency: 'STANDARD' as JobUrgency, message: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sentRef, setSentRef] = useState<string | null>(null);

  const company = content.data?.company;
  const officeList = offices.data ?? [];
  const office = officeList.find((o) => o.region === region) ?? officeList[0];
  const sla = content.data?.metrics.filter((m) => m.group === 'contact') ?? [];

  // Directions to the selected office's own configured location.
  const officeDirections = () => office && void openDirections({ latitude: office.latitude, longitude: office.longitude, address: office.address });

  // Blocks a second tap before the pending state re-renders the button.
  const sending = useRef(false);
  const onSubmit = async () => {
    if (sending.current) return;
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name';
    if (!emailSchema.safeParse(form.email).success) e.email = 'Enter a valid email';
    if (!phoneSchema.safeParse(form.phone).success) e.phone = 'Enter a valid phone number';
    if (form.message.trim().length < 10) e.message = 'Tell us a little more (10+ characters)';
    if (!consent) e.consent = 'Consent is required so we can respond';
    setErrors(e);
    if (Object.keys(e).length) return;
    sending.current = true;
    try {
      const res = await submit.mutateAsync({ ...form, name: form.name.trim(), message: form.message.trim(), source: 'CONTACT_FORM', consent: true });
      setSentRef(res.reference);
      setForm((f) => ({ ...f, message: '' }));
      setConsent(false);
    } catch (err) {
      // Everything typed stays in the form for a retry.
      if (err instanceof ApiError && err.details) setErrors(err.fieldErrors());
      toast.error(errorMessage(err));
    } finally {
      sending.current = false;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Contact Us" />
      <Screen onRefresh={() => void Promise.all([offices.refetch(), departments.refetch()])} refreshing={offices.isRefetching}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={styles.hero}>
            <Image source={imageFor('contact-hq')} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Headquarters building" />
            <View style={styles.shade} />
            <Badge label="CORPORATE HQ" icon="home" tone="primary" solid />
            <View>
              <Label color="primaryBright">24/7 Operations Hub</Label>
              <Text variant="h1">PSG Electrical Headquarters</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Icon name="map-pin" size={13} color="textSecondary" />
                <Text variant="bodySmall" color="textSecondary">{officeList[0]?.area ?? 'South Africa'}</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md }}>
            <QuickAction icon="phone-call" label="Call HQ" color={colors.primary} onPress={() => company && void callNumber(company.hotline)} />
            <QuickAction icon="shield" label="Emergency" color={colors.danger} onPress={() => company && void callNumber(company.emergencyLine)} />
            <QuickAction icon="message-square" label="WhatsApp" color={colors.surfaceElevated} onPress={() => company && void openWhatsApp(company.whatsapp, 'Hello PSG Electrical, I would like assistance with…')} />
          </View>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <View style={styles.between}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="clock" size={18} color="primaryBright" /><Text variant="title" weight="bold">DISPATCH SLA GUARANTEE</Text></View>
            <Badge label="Verified ISO 9001" tone="secondary" mono={false} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {sla.map((m) => (
              <View key={m.key} style={styles.slaBox}>
                <Text variant="caption" color="textMuted">{m.label}</Text>
                <Text variant="mono" color={m.accent === 'neutral' ? 'dangerBright' : m.accent === 'primary' ? 'primaryBright' : 'secondaryBright'}>{m.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.between}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="navigation" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Regional Offices & Dispatch</Label></View>
          <Text variant="caption" color="textMuted">{officeList.length} South Africa Hubs</Text>
        </View>
        {officeList.length ? <FilterChips value={office?.region ?? ''} onChange={setRegion} options={officeList.map((o) => ({ value: o.region, label: o.region }))} /> : null}
        {office ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{office.name}</Text>
                <Text variant="mono" color="primaryBright" style={{ fontSize: 12 }}>{office.area}</Text>
              </View>
              <Badge label="GPS Active" tone="neutral" mono={false} />
            </View>
            <Row icon="map-pin" text={office.address} />
            <View style={styles.between}>
              <Row icon="phone" text={office.phone} bold onPress={() => void callNumber(office.phone)} />
              <Pressable accessibilityRole="button" accessibilityLabel="Copy phone number" hitSlop={10} onPress={() => void Clipboard.setStringAsync(office.phone).then(() => toast.success('Number copied'))}>
                <Text variant="bodySmall" color="primaryBright">Copy</Text>
              </Pressable>
            </View>
            <Row icon="mail" text={office.email} mono onPress={() => void sendEmail(office.email)} />
            {office.manager ? <Row icon="user" text={office.manager} /> : null}
            <Row icon="clock" text={office.hours} />
            <Button label="Open GPS Directions" icon="external-link" variant="secondary" onPress={officeDirections} />
          </Card>
        ) : null}

        <View style={styles.between}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="file-text" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Direct Technical Dispatch Form</Label></View>
          <Text variant="caption" color="textMuted">Fast Response</Text>
        </View>
        <Card style={{ gap: spacing.lg }}>
          {sentRef ? (
            <View style={styles.sent}>
              <Icon name="check-circle" size={20} color="success" />
              <Text variant="bodySmall" style={{ flex: 1 }}>Enquiry <Text variant="mono" color="primaryBright">{sentRef}</Text> received. Our dispatch desk will respond shortly.</Text>
            </View>
          ) : null}
          <TextField label="Full Name" required value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. David Nkosi" error={errors.name} autoComplete="name" />
          <TextField label="Email Address" required value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} placeholder="name@company.co.za" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          <TextField label="Phone Number" required value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="+27 82 000 0000" keyboardType="phone-pad" error={errors.phone} />
          <SelectField label="Project Sector" value={form.sector} options={SECTORS} onChange={(v) => setForm({ ...form, sector: v })} />
          <View style={{ gap: 6 }}>
            <Text variant="title" weight="bold">Urgency Level</Text>
            <Segmented tone="danger" value={form.urgency} onChange={(v) => setForm({ ...form, urgency: v })} options={[{ value: 'STANDARD', label: 'Standard (24h)' }, { value: 'HIGH', label: 'High Priority' }, { value: 'EMERGENCY', label: '24/7 Critical' }]} />
          </View>
          <TextField label="Scope Brief / Message" required multiline value={form.message} onChangeText={(v) => setForm({ ...form, message: v })} placeholder="Describe your electrical requirements or technical inquiry…" error={errors.message} maxLength={3000} />
          <Checkbox checked={consent} onChange={setConsent} error={errors.consent} label="I consent to PSG Electrical storing these details to respond to my enquiry (POPIA)." />
          <Button label="Dispatch Technical Inquiry" icon="send" loading={submit.isPending} onPress={() => void onSubmit()} haptic />
          <Text variant="caption" color="textMuted" align="center">
            {user?.role === 'CUSTOMER' ? 'This sends a message to the office. To book work you can track, use Request service in your dashboard.' : 'This sends an enquiry to the office — no account needed. We reply by your preferred method.'}
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="headphones" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Department Direct Contacts</Label></View>
        {(departments.data ?? []).map((d) => (
          <Card key={d.id} onPress={() => void callNumber(d.phone)} accessibilityLabel={`Call ${d.name}`}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={styles.deptIcon}><Icon name={DEPT_ICON[d.icon] ?? 'phone'} size={18} color="primaryBright" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.between}>
                  <Text variant="title" weight="bold" style={{ flex: 1 }}>{d.name}</Text>
                  <Badge label={d.sla} tone="primary" mono={false} />
                </View>
                <Text variant="mono" color="textMuted" style={{ fontSize: 12 }}>{d.email}</Text>
                <Text variant="mono" style={{ fontSize: 13 }}>{d.phone}</Text>
              </View>
            </View>
          </Card>
        ))}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="help-circle" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Contact FAQ & Guidelines</Label></View>
        {(faqs.data ?? []).map((f) => <Accordion key={f.id} title={f.question}>{f.answer}</Accordion>)}

        <Card>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Icon name="shield" size={22} color="secondaryBright" />
            <View style={{ flex: 1 }}>
              <Text variant="title" weight="bold">ISO 9001 & OHSAS 18001 Certified</Text>
              <Text variant="caption" color="textMuted">Full Safety & High Voltage Compliance</Text>
            </View>
            <Badge label="Verified" tone="neutral" mono={false} />
          </View>
        </Card>
        <DemoNote show={content.data?.isDemoContent} />
      </Screen>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quick, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name={icon} size={20} color="white" />
      <Text variant="caption" weight="bold" color="white">{label}</Text>
    </Pressable>
  );
}

function Row({ icon, text, bold, mono, onPress }: { icon: IconName; text: string; bold?: boolean; mono?: boolean; onPress?: () => void }) {
  const body = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexShrink: 1 }}>
      <Icon name={icon} size={16} color={icon === 'user' ? 'secondaryBright' : 'primaryBright'} />
      <Text variant={mono ? 'mono' : 'bodySmall'} weight={bold ? 'bold' : undefined} color={bold || mono ? 'text' : 'textSecondary'} style={{ flexShrink: 1 }}>{text}</Text>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="link" onPress={onPress} style={{ flexShrink: 1 }}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  hero: { height: 200, padding: spacing.lg, justifyContent: 'space-between' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,15,22,0.5)' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  quick: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, minHeight: 64 },
  slaBox: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  deptIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  sent: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.successMuted, borderRadius: radius.md, padding: spacing.md },
});
