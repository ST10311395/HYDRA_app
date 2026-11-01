/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { email as emailSchema, phone as phoneSchema, type JobUrgency } from '@hydra/shared';
import { errorMessage, newIdempotencyKey } from '../../../api/client';
import { useCreateJob, useFaqs, useServices, useSubmitEnquiry } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Accordion, Button, Card, Checkbox, DateField, Icon, Label, ProgressBar, SelectField, Segmented, Text, TextField, colors, noSelect, radius, spacing, toast } from '../../../design-system';
import { PhotoPicker, type UploadedPhoto } from '../../../features/photos';
import { useAuth } from '../../../store/auth';
import { URGENCY_OPTIONS, todayIso, urgencyLabel } from '../../../utils/format';
import { PSG_CONTACT } from '../../../content/company';
import { SAFETY_NOTE } from '../../../content/marketing';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { SECTORS, SITE_LABEL, SITE_TYPES, resolveSector, type SectorKey, type SiteType } from '../../../features/quoteSectors';

/** Optional supply type (advanced details); not sure is fine — we confirm on assessment. */
const VOLTAGES = ['Single-phase (230 V)', 'Three-phase (400 V)', 'Not sure'].map((v) => ({ value: v, label: v }));

const STEPS = ['Service', 'Scope', 'Location', 'Submit'] as const;
const DRAFT_KEY = 'hydra.quote-draft.v1';

interface Draft {
  sector: SectorKey;
  siteType: SiteType;
  voltage: string;
  serviceTypeId: string;
  scope: string;
  urgency: JobUrgency;
  loadKva: string;
  preferredDate: string;
  siteAddress: string;
  name: string;
  email: string;
  phone: string;
  contactMethod: 'PHONE' | 'EMAIL' | 'WHATSAPP';
}

const EMPTY: Draft = {
  sector: 'INSTALL',
  siteType: '',
  voltage: '',
  serviceTypeId: '',
  scope: '',
  urgency: 'STANDARD',
  loadKva: '',
  preferredDate: '',
  siteAddress: '',
  name: '',
  email: '',
  phone: '',
  contactMethod: 'PHONE',
};

export default function QuoteScreen() {
  const params = useLocalSearchParams<{ serviceTypeId?: string; sector?: string; kva?: string }>();
  const user = useAuth((s) => s.user);
  const services = useServices();
  const faqs = useFaqs('QUOTATION');
  const createJob = useCreateJob();
  const submitEnquiry = useSubmitEnquiry();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<null | { reference: string; jobId?: string }>(null);
  // Stable per request: a double tap or retry replays rather than logging a second job.
  const [requestKey, setRequestKey] = useState(newIdempotencyKey);
  const sending = useRef(false);

  // Resume a saved draft, then apply deep-link params (service card / estimator). Keyed on the
  // account id, not the user object: a refreshed session user (e.g. after a profile save) must not
  // reload the stored draft over what is being typed.
  const userId = user?.id ?? null;
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!live) return;
      const user = useAuth.getState().user;
      let parsed: Partial<Draft> = {};
      try {
        parsed = raw ? (JSON.parse(raw) as Partial<Draft>) : {};
      } catch {
        // Corrupt draft: start fresh.
      }
      const saved = { ...EMPTY, ...parsed };
      // Supply types from before Part 3 (e.g. “Medium Voltage (11kV)”) are no longer offered.
      if (saved.voltage && !VOLTAGES.some((v) => v.value === saved.voltage)) saved.voltage = '';
      // A draft saved before Part 3 may hold a removed sector (e.g. FIBRE): map it, never crash.
      const savedSector = resolveSector(saved.sector) ?? { sector: EMPTY.sector };
      // Deep links preselect a sector (legacy keys included); a fault opens exactly as tapping it would.
      const linked = resolveSector(params.sector);
      const sectorKey = linked?.sector ?? savedSector.sector;
      setDraft({
        ...saved,
        sector: sectorKey,
        siteType: linked?.site ?? (linked ? saved.siteType : savedSector.site ?? saved.siteType),
        ...(linked?.sector === 'FAULT' ? { urgency: 'EMERGENCY' as const } : {}),
        ...(params.kva ? { loadKva: params.kva } : {}),
        ...(params.serviceTypeId ? { serviceTypeId: params.serviceTypeId } : {}),
        name: saved.name || (user ? `${user.firstName} ${user.lastName}`.trim() : ''),
        email: saved.email || user?.email || '',
        phone: saved.phone || user?.phone || '',
      });
    });
    return () => {
      live = false;
    };
  }, [params.sector, params.kva, params.serviceTypeId, userId]);

  useEffect(() => {
    if (draft !== EMPTY) void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  // Deep link with a specific service picks its matching sector.
  const deepLinked = params.serviceTypeId ? services.data?.find((x) => x.id === params.serviceTypeId) : undefined;
  useSyncFrom(deepLinked, (svc) => {
    const sec = SECTORS.find((x) => x.category === svc.category);
    if (sec) setDraft((d) => ({ ...d, sector: sec.key, serviceTypeId: svc.id }));
  });

  const sector = SECTORS.find((s) => s.key === draft.sector)!;
  const serviceOptions = useMemo(() => {
    const all = services.data ?? [];
    const matching = all.filter((s) => s.category === sector.category);
    return (matching.length ? [...matching, ...all.filter((s) => s.category !== sector.category)] : all).map((s) => ({ value: s.id, label: s.name }));
  }, [services.data, sector.category]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const validate = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!draft.serviceTypeId) e.serviceTypeId = 'Choose the service required';
      if (draft.scope.trim().length < 10) e.scope = 'Describe the scope in at least 10 characters';
      if (draft.loadKva && !/^\d{1,5}$/.test(draft.loadKva)) e.loadKva = 'Enter a whole number of kVA';
    }
    if (s === 2) {
      if (draft.siteAddress.trim().length < 5) e.siteAddress = 'Enter the site address';
      if (!user) {
        if (draft.name.trim().length < 2) e.name = 'Enter your full name';
        if (!emailSchema.safeParse(draft.email).success) e.email = 'Enter a valid email address';
      }
      if (!phoneSchema.safeParse(draft.phone).success) e.phone = 'Enter a valid phone number';
    }
    if (s === 3 && !consent) e.consent = user ? 'Please confirm your contact details' : 'Consent is required so we can respond';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    if (step === 0 && !draft.serviceTypeId) {
      const first = (services.data ?? []).find((s) => s.category === sector.category);
      if (first) set('serviceTypeId', first.id);
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const submit = async () => {
    if (sending.current || !validate(3)) return;
    sending.current = true;
    const site = draft.siteType ? SITE_LABEL[draft.siteType] : null;
    const description = [`[${sector.title}] ${draft.scope.trim()}`, site ? `Site type: ${site}` : null, draft.voltage ? `Supply: ${draft.voltage}` : null, draft.loadKva ? `Estimated load: ${draft.loadKva} kVA` : null].filter(Boolean).join('\n');
    try {
      if (user?.role === 'CUSTOMER') {
        const job = await createJob.mutateAsync({
          serviceTypeId: draft.serviceTypeId,
          siteAddress: draft.siteAddress.trim(),
          description: description.slice(0, 2000),
          urgency: draft.urgency,
          preferredDate: draft.preferredDate || undefined,
          contactPhone: draft.phone,
          contactConfirmed: true,
          attachmentIds: photos.map((p) => p.id),
          idempotencyKey: requestKey,
        });
        setDone({ reference: job.reference, jobId: job.id });
      } else {
        const res = await submitEnquiry.mutateAsync({
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          sector: site ? `${sector.title} (${site})` : sector.title,
          urgency: draft.urgency,
          message: description.slice(0, 3000),
          source: 'QUOTE_TOOL',
          consent: true,
          details: {
            sector: site ? `${sector.title} (${site})` : sector.title,
            voltageLevel: draft.voltage || undefined,
            scope: draft.scope.trim(),
            siteAddress: draft.siteAddress.trim(),
            estimatedLoadKva: draft.loadKva ? Number(draft.loadKva) : undefined,
            preferredContact: draft.contactMethod,
          },
        });
        setDone({ reference: res.reference });
      }
      await AsyncStorage.removeItem(DRAFT_KEY);
      setDraft({ ...EMPTY, name: draft.name, email: draft.email, phone: draft.phone });
      setPhotos([]);
      setConsent(false);
      setRequestKey(newIdempotencyKey());
    } catch (e) {
      // The draft is kept (and still saved on the device) so nothing typed is lost.
      toast.error(errorMessage(e));
    } finally {
      sending.current = false;
    }
  };

  const submitting = createJob.isPending || submitEnquiry.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Quotation" />
      <Screen>
        <Card style={{ gap: spacing.sm }} testID="quote-intro">
          <Label color="primaryBright">Request a quote</Label>
          <Text variant="h1">Tell us what you need</Text>
          <Text variant="bodySmall" color="textMuted">
            We review every request and contact you during office hours ({PSG_CONTACT.hours}) to confirm the scope. You decide whether to accept the quotation.
          </Text>
        </Card>

        {done ? (
          <Card accent="success" style={{ gap: spacing.md, alignItems: 'center' }}>
            <View style={styles.success}><Icon name="check" size={28} color="success" /></View>
            <Text variant="h2" align="center">{done.jobId ? 'Service request logged' : 'Quotation request received'}</Text>
            <Text variant="body" color="textMuted" align="center">
              Reference <Text variant="mono" color="primaryBright">{done.reference}</Text>.{' '}
              {done.jobId ? 'We will review it and send your quotation in the app.' : `We will contact you during office hours (${PSG_CONTACT.hours}).`}
            </Text>
            {done.jobId ? (
              <Button label="Track this request" iconRight="arrow-right" onPress={() => router.push(`/customer/job/${done.jobId}`)} />
            ) : (
              <>
                <Text variant="bodySmall" color="textMuted" align="center">Create an account to track quotes, jobs and invoices in real time.</Text>
                <Button label="Create account" onPress={() => router.push('/register')} />
              </>
            )}
            <Button label="Start another request" variant="ghost" onPress={() => { setDone(null); setStep(0); }} />
          </Card>
        ) : (
          <>
            <SubmissionMode />
            <Card style={{ gap: spacing.md }}>
              <View style={styles.between}>
                <Label style={{ fontSize: 13 }}>{`Step ${step + 1} of 4: ${['What you need', 'Scope & details', 'Location & contact', 'Review & submit'][step]}`}</Label>
                <Text variant="mono" color="primaryBright" style={{ fontSize: 16 }}>{(step + 1) * 25}%</Text>
              </View>
              <ProgressBar value={(step + 1) / 4} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {STEPS.map((s, i) => (
                  <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: i === step, disabled: i > step }} disabled={i > step} onPress={() => setStep(i)} style={[styles.stepPill, noSelect, i === step ? styles.stepActive : null]}>
                    <Text variant="mono" color={i <= step ? 'primaryBright' : 'textMuted'} style={{ fontSize: 12 }}>0{i + 1}</Text>
                    <Text variant="caption" color={i === step ? 'text' : 'textMuted'}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            {step === 0 ? (
              <View style={{ gap: spacing.md }}>
                <View>
                  <Text variant="h2">What do you need?</Text>
                  <Text variant="bodySmall" color="textMuted">Choose the closest match — you can describe the details in the next step.</Text>
                </View>
                {SECTORS.map((s) => {
                  const active = s.key === draft.sector;
                  return (
                    <Pressable
                      key={s.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setDraft((d) => ({ ...d, sector: s.key, serviceTypeId: '', urgency: s.key === 'FAULT' ? 'EMERGENCY' : d.urgency }))}
                      style={[styles.sector, noSelect, active ? { borderColor: colors.primaryBright, backgroundColor: '#152037' } : null]}
                    >
                      <View style={[styles.sectorIcon, active ? { backgroundColor: colors.primary } : null]}><Icon name={s.icon} size={20} color={active ? 'white' : 'textSecondary'} /></View>
                      <View style={{ flex: 1 }}>
                        <Text variant="title" weight="bold">{s.title}</Text>
                        <Text variant="caption" color="textMuted">{s.sub}</Text>
                      </View>
                      {active ? <Icon name="check" size={18} color="primaryBright" /> : null}
                    </Pressable>
                  );
                })}
                <Card style={{ gap: spacing.sm }}>
                  <SelectField label="Type of site (optional)" value={draft.siteType || undefined} options={[...SITE_TYPES]} onChange={(v) => set('siteType', v as SiteType)} placeholder="Choose a site type" />
                </Card>
              </View>
            ) : null}

            {step === 1 ? (
              <Card style={{ gap: spacing.lg }}>
                <SelectField label="Service required" value={draft.serviceTypeId || undefined} options={serviceOptions} onChange={(v) => set('serviceTypeId', v)} error={errors.serviceTypeId} placeholder={services.isLoading ? 'Loading services…' : 'Choose a service'} />
                <TextField label="Scope brief" required multiline value={draft.scope} onChangeText={(v) => set('scope', v)} placeholder="Describe the installation, fault or project scope…" error={errors.scope} maxLength={1800} />
                <View style={{ gap: 6 }}>
                  <Text variant="title" weight="bold">How urgent is it?</Text>
                  <Segmented tone="danger" value={draft.urgency} onChange={(v) => set('urgency', v)} options={URGENCY_OPTIONS} />
                  <Text variant="caption" color="textMuted">We prioritise urgent faults; this is not a guaranteed response time. {SAFETY_NOTE}</Text>
                </View>
                <DateField label="Preferred date (optional)" value={draft.preferredDate || undefined} minDate={todayIso()} onChange={(v) => set('preferredDate', v)} />
                {user?.role === 'CUSTOMER' ? <PhotoPicker value={photos} onChange={setPhotos} purpose="JOB_PHOTO" label="Site photos (optional)" /> : null}
                {/* Technical details kept for experienced customers (and the load estimator), hidden by default. */}
                <Accordion title="Advanced details (optional)" defaultOpen={!!draft.loadKva || !!draft.voltage || !!errors.loadKva}>
                  <View style={{ gap: spacing.md }}>
                    <SelectField label="Supply type" value={draft.voltage || undefined} options={VOLTAGES} onChange={(v) => set('voltage', v)} placeholder="Not specified" />
                    <TextField label="Estimated load (kVA)" keyboardType="number-pad" value={draft.loadKva} onChangeText={(v) => set('loadKva', v.replace(/\D/g, ''))} error={errors.loadKva} icon="activity" maxLength={5} />
                  </View>
                </Accordion>
              </Card>
            ) : null}

            {step === 2 ? (
              <Card style={{ gap: spacing.lg }}>
                <TextField label="Site address" required icon="map-pin" value={draft.siteAddress} onChangeText={(v) => set('siteAddress', v)} placeholder="Street, suburb, city, postal code" error={errors.siteAddress} helper="Can differ from your profile address (e.g. a second property)." />
                {!user ? (
                  <>
                    <TextField label="Full name" required value={draft.name} onChangeText={(v) => set('name', v)} placeholder="e.g. David Nkosi" error={errors.name} autoComplete="name" />
                    <TextField label="Email address" required value={draft.email} onChangeText={(v) => set('email', v)} placeholder="name@company.co.za" keyboardType="email-address" autoCapitalize="none" error={errors.email} autoComplete="email" />
                  </>
                ) : null}
                <TextField label="Contact number" required value={draft.phone} onChangeText={(v) => set('phone', v)} placeholder="+27 82 000 0000" keyboardType="phone-pad" error={errors.phone} autoComplete="tel" />
                <View style={{ gap: 6 }}>
                  <Text variant="title" weight="bold">Preferred contact method</Text>
                  <Segmented value={draft.contactMethod} onChange={(v) => set('contactMethod', v)} options={[{ value: 'PHONE', label: 'Phone' }, { value: 'EMAIL', label: 'Email' }, { value: 'WHATSAPP', label: 'WhatsApp' }]} />
                </View>
              </Card>
            ) : null}

            {step === 3 ? (
              <Card style={{ gap: spacing.md }}>
                <Text variant="h3">Review your request</Text>
                {[
                  ['Request', sector.title],
                  ['Site type', draft.siteType ? SITE_LABEL[draft.siteType] : 'Not specified'],
                  ['Service', serviceOptions.find((o) => o.value === draft.serviceTypeId)?.label ?? '—'],
                  ['Urgency', urgencyLabel(draft.urgency)],
                  ...(draft.voltage ? [['Supply', draft.voltage]] : []),
                  ...(draft.loadKva ? [['Load', `${draft.loadKva} kVA`]] : []),
                  ['Site', draft.siteAddress],
                  ['Contact', `${user ? `${user.firstName} ${user.lastName}` : draft.name} · ${draft.phone}`],
                  ['Photos', photos.length ? `${photos.length} attached` : 'None'],
                ].map(([k, v]) => (
                  <View key={k} style={[styles.between, { alignItems: 'flex-start' }]}>
                    <Text variant="bodySmall" color="textMuted">{k}</Text>
                    <Text variant="bodySmall" weight="semibold" style={{ flex: 1, textAlign: 'right' }}>{v}</Text>
                  </View>
                ))}
                <View style={styles.scopeBox}><Text variant="bodySmall" color="textSecondary">{draft.scope}</Text></View>
                <Checkbox
                  checked={consent}
                  onChange={setConsent}
                  error={errors.consent}
                  label={user ? 'I confirm my contact details are correct and PSG Electrical may contact me about this request.' : 'I agree that PSG Electrical may store these details to respond to my enquiry, as described in the privacy notice (POPIA).'}
                />
                {!user ? <Text variant="caption" color="textMuted">Already a customer? Sign in to log this as a trackable job instead.</Text> : null}
              </Card>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {step > 0 ? <Button label="Back" variant="secondary" icon="arrow-left" fullWidth={false} onPress={() => setStep((s) => s - 1)} /> : null}
              {step < 3 ? (
                <Button label={`Continue to ${STEPS[step + 1]}`} iconRight="arrow-right" style={{ flex: 1 }} onPress={next} />
              ) : (
                <Button label={user?.role === 'CUSTOMER' ? 'Submit Service Request' : 'Submit Quotation Request'} icon="send" style={{ flex: 1 }} loading={submitting} onPress={() => void submit()} haptic />
              )}
            </View>
            {!user && step === 3 ? <Button label="Sign in instead" variant="ghost" onPress={() => router.push('/login')} /> : null}
          </>
        )}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: spacing.md }}>
          <Icon name="help-circle" size={18} color="primaryBright" />
          <Text variant="h3">Quotation Process FAQ</Text>
        </View>
        {(faqs.data ?? []).map((f, i) => (
          <Accordion key={f.id} title={f.question} defaultOpen={i === 0}>{f.answer}</Accordion>
        ))}
      </Screen>
    </View>
  );
}

/**
 * Makes the outcome explicit (spec §12): guests and staff send a lead enquiry to the office;
 * a signed-in customer creates a service request (job) owned by their own account.
 */
function SubmissionMode() {
  const user = useAuth((s) => s.user);
  if (user?.role === 'CUSTOMER') {
    return (
      <Card accent="success" style={styles.mode} testID="quote-mode-customer">
        <Icon name="user-check" size={18} color="success" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" weight="bold">Service request on your account</Text>
          <Text variant="bodySmall" color="textMuted">Signed in as {user.firstName} {user.lastName}. Submitting creates a job you can track in My Jobs, with the quote sent to you in the app.</Text>
        </View>
      </Card>
    );
  }
  if (user) {
    return (
      <Card accent="secondary" style={styles.mode} testID="quote-mode-staff">
        <Icon name="briefcase" size={18} color="secondaryBright" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" weight="bold">Staff preview</Text>
          <Text variant="bodySmall" color="textMuted">This public form records a lead enquiry only. To log work for a customer, use Operations → More → Log a job.</Text>
        </View>
      </Card>
    );
  }
  return (
    <Card accent="primary" style={styles.mode} testID="quote-mode-guest">
      <Icon name="info" size={18} color="primaryBright" />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text variant="title" weight="bold">Sending as a guest</Text>
        <Text variant="bodySmall" color="textMuted">Your request goes to our office as an enquiry and we’ll contact you. Sign in or create an account to log it as a trackable service request instead.</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Button label="Sign in" size="sm" variant="secondary" fullWidth={false} onPress={() => router.push('/login')} />
          <Button label="Create account" size="sm" variant="outline" fullWidth={false} onPress={() => router.push('/register')} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  mode: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  stepPill: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  stepActive: { borderColor: colors.primaryBright, backgroundColor: '#152037' },
  sector: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 64 },
  sectorIcon: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  success: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.successMuted, alignItems: 'center', justifyContent: 'center' },
  scopeBox: { backgroundColor: colors.surfaceInset, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
});
