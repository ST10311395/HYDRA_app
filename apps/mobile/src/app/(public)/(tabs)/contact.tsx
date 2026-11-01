/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { email as emailSchema, phone as phoneSchema, type JobUrgency } from '@hydra/shared';
import { ApiError, errorMessage } from '../../../api/client';
import { useDepartments, useFaqs, useOffices, usePublicContent, useSubmitEnquiry } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { PSG_CONTACT } from '../../../content/company';
import { SAFETY_NOTE } from '../../../content/marketing';
import { Accordion, Button, Card, Checkbox, FilterChips, Icon, Label, SelectField, Segmented, Text, TextField, colors, radius, spacing, toast, type IconName } from '../../../design-system';
import { useAuth } from '../../../store/auth';
import { URGENCY_OPTIONS } from '../../../utils/format';
import { callNumber, openDirections, openWhatsApp, sendEmail } from '../../../utils/links';

/** Quick-intake categories published on the PSG website (Part 3). Stored as free text on the enquiry. */
const SECTORS = ['New installation', 'Fault or repair', 'DB board', 'Compliance (CoC)', 'Solar & backup', 'Maintenance', 'Other'].map((v) => ({ value: v, label: v }));
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

  const whatsapp = content.data?.company.whatsapp?.trim();
  // Offices and department desks are shown only when the business has configured them.
  const officeList = offices.data ?? [];
  const office = officeList.find((o) => o.region === region) ?? officeList[0];
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
      <Screen onRefresh={() => void Promise.all([offices.refetch(), departments.refetch(), content.refetch()])} refreshing={offices.isRefetching}>
        <Card style={{ gap: spacing.md }} testID="contact-details">
          <View style={{ gap: 4 }}>
            <Text variant="h1">Contact {PSG_CONTACT.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Icon name="clock" size={14} color="primaryBright" />
              <Text variant="bodySmall" color="textSecondary">Office hours {PSG_CONTACT.hours}</Text>
            </View>
          </View>
          {PSG_CONTACT.phones.map((p) => (
            <View key={p.number} style={styles.between}>
              <Row icon="phone" text={`${p.label}: ${p.number}`} bold onPress={() => void callNumber(p.number)} label={`Call ${p.label.toLowerCase()} ${p.number}`} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${p.number}`} hitSlop={10} onPress={() => void Clipboard.setStringAsync(p.number).then(() => toast.success('Number copied'))}>
                <Text variant="bodySmall" color="primaryBright">Copy</Text>
              </Pressable>
            </View>
          ))}
          <Row icon="mail" text={PSG_CONTACT.email} mono onPress={() => void sendEmail(PSG_CONTACT.email, 'Enquiry from the PSG app')} />
          <Row icon="sun" text={`Solar (Trite Solar): ${PSG_CONTACT.solarEmail}`} mono onPress={() => void sendEmail(PSG_CONTACT.solarEmail, 'Solar enquiry from the PSG app')} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <QuickAction icon="phone-call" label="Call PSG" color={colors.primary} onPress={() => void callNumber(PSG_CONTACT.primaryPhone)} />
            {whatsapp ? <QuickAction icon="message-square" label="WhatsApp" color={colors.surfaceElevated} onPress={() => void openWhatsApp(whatsapp, 'Hello PSG Electrical, I would like assistance with…')} /> : null}
          </View>
          <Text variant="caption" color="textMuted">You can send a request at any time; we respond during office hours.</Text>
        </Card>

        <Card accent="danger" style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <Icon name="alert-triangle" size={18} color="dangerBright" />
          <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>{SAFETY_NOTE}</Text>
        </Card>

        {officeList.length ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="navigation" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Offices</Label></View>
            {officeList.length > 1 ? <FilterChips value={office?.region ?? ''} onChange={setRegion} options={officeList.map((o) => ({ value: o.region, label: o.region }))} /> : null}
            {office ? (
              <Card style={{ gap: spacing.md }}>
                <View>
                  <Text variant="h3">{office.name}</Text>
                  <Text variant="mono" color="primaryBright" style={{ fontSize: 12 }}>{office.area}</Text>
                </View>
                <Row icon="map-pin" text={office.address} />
                <Row icon="phone" text={office.phone} bold onPress={() => void callNumber(office.phone)} />
                <Row icon="mail" text={office.email} mono onPress={() => void sendEmail(office.email)} />
                {office.manager ? <Row icon="user" text={office.manager} /> : null}
                <Row icon="clock" text={office.hours} />
                <Button label="Open directions" icon="external-link" variant="secondary" onPress={officeDirections} />
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="file-text" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Send us a message</Label></View>
        <Card style={{ gap: spacing.lg }}>
          {sentRef ? (
            <View style={styles.sent}>
              <Icon name="check-circle" size={20} color="success" />
              <Text variant="bodySmall" style={{ flex: 1 }}>Enquiry <Text variant="mono" color="primaryBright">{sentRef}</Text> received. We will respond during office hours ({PSG_CONTACT.hours}).</Text>
            </View>
          ) : null}
          <TextField label="Full Name" required value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. David Nkosi" error={errors.name} autoComplete="name" />
          <TextField label="Email Address" required value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} placeholder="name@company.co.za" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          <TextField label="Phone Number" required value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="+27 82 000 0000" keyboardType="phone-pad" error={errors.phone} />
          <SelectField label="What do you need?" value={form.sector} options={SECTORS} onChange={(v) => setForm({ ...form, sector: v })} />
          <View style={{ gap: 6 }}>
            <Text variant="title" weight="bold">Urgency</Text>
            <Segmented tone="danger" value={form.urgency} onChange={(v) => setForm({ ...form, urgency: v })} options={URGENCY_OPTIONS} />
          </View>
          <TextField label="Message" required multiline value={form.message} onChangeText={(v) => setForm({ ...form, message: v })} placeholder="Describe the work you need or your question…" error={errors.message} maxLength={3000} />
          <Checkbox checked={consent} onChange={setConsent} error={errors.consent} label="I consent to PSG Electrical storing these details to respond to my enquiry (POPIA)." />
          <Button label="Send enquiry" icon="send" loading={submit.isPending} onPress={() => void onSubmit()} haptic />
          <Text variant="caption" color="textMuted" align="center">
            {user?.role === 'CUSTOMER' ? 'This sends a message to the office. To book work you can track, use Request service in your dashboard.' : 'This sends an enquiry to the office — no account needed. We reply by your preferred method.'}
          </Text>
        </Card>

        {(departments.data ?? []).length ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="headphones" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Department contacts</Label></View>
            {(departments.data ?? []).map((d) => (
              <Card key={d.id} onPress={() => void callNumber(d.phone)} accessibilityLabel={`Call ${d.name}`}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View style={styles.deptIcon}><Icon name={DEPT_ICON[d.icon] ?? 'phone'} size={18} color="primaryBright" /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="title" weight="bold">{d.name}</Text>
                    <Text variant="mono" color="textMuted" style={{ fontSize: 12 }}>{d.email}</Text>
                    <Text variant="mono" style={{ fontSize: 13 }}>{d.phone}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {(faqs.data ?? []).length ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="help-circle" size={16} color="primaryBright" /><Label color="primaryBright" style={{ fontSize: 13 }}>Contact FAQ</Label></View>
            {(faqs.data ?? []).map((f) => <Accordion key={f.id} title={f.question}>{f.answer}</Accordion>)}
          </>
        ) : null}
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

function Row({ icon, text, bold, mono, onPress, label }: { icon: IconName; text: string; bold?: boolean; mono?: boolean; onPress?: () => void; label?: string }) {
  const body = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexShrink: 1 }}>
      <Icon name={icon} size={16} color={icon === 'user' ? 'secondaryBright' : 'primaryBright'} />
      <Text variant={mono ? 'mono' : 'bodySmall'} weight={bold ? 'bold' : undefined} color={bold || mono ? 'text' : 'textSecondary'} style={{ flexShrink: 1 }}>{text}</Text>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={{ flexShrink: 1, minHeight: 32, justifyContent: 'center' }}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  quick: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, minHeight: 64 },
  deptIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  sent: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.successMuted, borderRadius: radius.md, padding: spacing.md },
});
