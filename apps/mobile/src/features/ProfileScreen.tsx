import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import { ROLE_LABELS, SELF_EDITABLE_FIELDS, updateProfileSchema, type AuthUser, type Role, type UpdateProfileInput } from '@hydra/shared';
import { ApiError, api, errorMessage } from '../api/client';
import { qk, useProfile } from '../api/queries';
import { BrandHeader, Screen } from '../components/layout';
import { SegmentLink } from '../components/jobs';
import { Badge, Button, Card, Checkbox, KeyValue, Label, SelectField, Text, TextField, confirm, spacing, toast } from '../design-system';
import { useAuth } from '../store/auth';
import { googleSignInNotice, signInWithGoogle } from './googleSignIn';
import { isPushEnabled, setPushEnabled } from './pushRegistration';
import { config } from '../config';

/** Editable copy of the persisted profile (all strings so inputs stay controlled). */
export interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  marketingOptIn: boolean;
}

export const profileFormFrom = (u: AuthUser): ProfileForm => ({
  firstName: u.firstName,
  lastName: u.lastName,
  phone: u.phone ?? '',
  address: u.address ?? '',
  marketingOptIn: u.marketingOptIn ?? false,
});

/**
 * Only the fields this role may edit that actually differ from the persisted profile. Sending a
 * diff (not the whole form) means an untouched empty phone or a stale value can never block or
 * overwrite anything.
 */
export function profileChanges(saved: AuthUser, form: ProfileForm, role: Role): UpdateProfileInput {
  const allowed: readonly string[] = SELF_EDITABLE_FIELDS[role];
  const base = profileFormFrom(saved);
  const out: UpdateProfileInput = {};
  if (allowed.includes('firstName') && form.firstName.trim() !== base.firstName) out.firstName = form.firstName;
  if (allowed.includes('lastName') && form.lastName.trim() !== base.lastName) out.lastName = form.lastName;
  if (allowed.includes('phone') && form.phone.trim() !== base.phone) out.phone = form.phone;
  if (allowed.includes('address') && form.address.trim() !== base.address) out.address = form.address.trim();
  if (allowed.includes('marketingOptIn') && form.marketingOptIn !== base.marketingOptIn) out.marketingOptIn = form.marketingOptIn;
  return out;
}

function fieldErrorsOf(changes: UpdateProfileInput): Record<string, string> {
  const r = updateProfileSchema.safeParse(changes);
  const out: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

/** Shared profile & privacy screen for every role (profile correction, password, Google link, POPIA rights). */
export function ProfileScreen({ extra, back = false }: { extra?: ReactNode; back?: boolean }) {
  const sessionUser = useAuth((s) => s.user)!;
  const profile = useProfile();
  // Server copy once loaded; the session copy (same server origin) while the first fetch runs.
  const me = profile.data ?? sessionUser;
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState<string | null>(null);
  const [request, setRequest] = useState<'ACCESS' | 'CORRECTION' | 'DELETION'>('CORRECTION');
  const [requestDetails, setRequestDetails] = useState('');
  const setUser = useAuth((s) => s.setUser);

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <BrandHeader section="Profile" back={back} />
      <Screen withTabBar={!back} refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="h2" style={{ flex: 1 }} testID="profile-name">{me.firstName} {me.lastName}</Text>
            <Badge label={ROLE_LABELS[me.role].toUpperCase()} tone="primary" />
          </View>
          <KeyValue label="Email" value={me.email} />
          {me.staffNumber ? <KeyValue label="Staff number" value={me.staffNumber} mono /> : null}
          <KeyValue label="Phone" value={me.phone ?? '—'} />
          {me.role === 'CUSTOMER' ? <KeyValue label="Address" value={me.address ?? '—'} /> : null}
          <KeyValue label="Google sign-in" value={me.hasGoogleLink ? 'Linked' : 'Not linked'} valueColor={me.hasGoogleLink ? 'success' : 'textMuted'} />
          {profile.isError ? <Text variant="caption" color="warning">Showing the details from sign-in — {errorMessage(profile.error)}</Text> : null}
        </Card>

        <EditDetails me={me} ready={!!profile.data} onRetry={() => void profile.refetch()} />

        {extra}

        <PasswordCard me={me} onChanged={() => signOut({ remote: false })} />

        {!me.hasGoogleLink ? (
          <Card style={{ gap: spacing.md }}>
            <Label>Google sign-in</Label>
            <Button label="Link Google account" icon="globe" variant="outline" loading={busy === 'google'} disabled={!!googleSignInNotice()} accessibilityHint={googleSignInNotice() ?? undefined} onPress={() => void run('google', async () => {
              const r = await signInWithGoogle();
              if (!r.ok) {
                if (r.reason !== 'cancelled') toast.error(r.message);
                return;
              }
              setUser(await api.post<AuthUser>('/auth/google/link', { idToken: r.idToken }));
              toast.success('Google account linked');
            })} />
            {googleSignInNotice() ? <Text variant="caption" color="textMuted">{googleSignInNotice()}</Text> : null}
          </Card>
        ) : null}

        <NotificationPreferences />

        <Card style={{ gap: spacing.md }}>
          <Label>Privacy (POPIA)</Label>
          <SegmentLink icon="shield" label="Privacy notice" onPress={() => router.push('/privacy')} />
          <Button label="Download a copy of my data" icon="download" variant="secondary" loading={busy === 'export'} onPress={() => void run('export', async () => {
            const data = await api.get<unknown>('/profile/data-export');
            await Share.share({ title: 'My HYDRA data', message: JSON.stringify(data, null, 2) });
          })} />
          <SelectField label="Submit a data request" value={request} onChange={setRequest} options={[{ value: 'CORRECTION', label: 'Correct my information' }, { value: 'ACCESS', label: 'Access request' }, { value: 'DELETION', label: 'Delete / anonymise my account' }]} />
          <TextField placeholder="Details (optional)" value={requestDetails} onChangeText={setRequestDetails} multiline maxLength={1000} />
          <Button label="Submit request" variant="outline" loading={busy === 'dsr'} onPress={() => void run('dsr', async () => {
            if (request === 'DELETION' && !(await confirm({ title: 'Request account deletion?', message: 'The office will anonymise your account where the law allows. Job, compliance and financial records must be retained.', confirmLabel: 'Submit', destructive: true }))) return;
            await api.post('/profile/data-requests', { type: request, details: requestDetails || undefined });
            setRequestDetails('');
            toast.success('Request submitted — the office will respond.');
          })} />
        </Card>

        <Button label="Sign out" icon="log-out" variant="dangerOutline" onPress={() => void (async () => {
          if (await confirm({ title: 'Sign out?', message: 'You will need to sign in again to access your account.', confirmLabel: 'Sign out' })) {
            await signOut();
            router.replace('/');
          }
        })()} />
        <Text variant="caption" color="textFaint" align="center">HYDRA v1.0.0 · {config.appEnv}</Text>
      </Screen>
    </View>
  );
}

const MANAGED_NOTE: Record<Role, string> = {
  CUSTOMER: 'Your email is your sign-in and can’t be changed here — submit a correction request below if it is wrong.',
  EMPLOYEE: 'Email, staff number, role, pay rate and employment details are managed by the PSG Electrical office.',
  ADMIN_OFFICE: 'Email, staff number and role are managed by the owner.',
  ADMIN_OWNER: 'Email, staff number and role are organisation records — change them from Staff accounts.',
};

/** Edit mode for the fields this role may change. Loads from, saves to and re-reads the API. */
function EditDetails({ me, ready, onRetry }: { me: AuthUser; ready: boolean; onRetry: () => void }) {
  const qc = useQueryClient();
  const setUser = useAuth((s) => s.setUser);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Blocks a second tap that lands before the pending state re-renders the button.
  const inFlight = useRef(false);
  const editable: readonly string[] = SELF_EDITABLE_FIELDS[me.role];
  const changes = form ? profileChanges(me, form, me.role) : {};
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: (body: UpdateProfileInput) => api.patch<AuthUser>('/profile', body),
    onSuccess: (u) => {
      qc.setQueryData(qk.profile, u);
      setUser(u);
      // Greetings and lists that embed the name re-read it.
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setForm(null);
      setErrors({});
      toast.success('Profile updated');
    },
    onError: (e) => {
      // Keep everything the user typed; mark the fields the server rejected.
      if (e instanceof ApiError) setErrors(e.fieldErrors());
      toast.error(errorMessage(e));
    },
  });

  if (!form) {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Button
          label="Edit my details"
          icon="edit-2"
          variant="secondary"
          testID="profile-edit"
          disabled={!ready}
          onPress={() => {
            setErrors({});
            setForm(profileFormFrom(me));
          }}
        />
        {!ready ? (
          <Button label="Load my saved details" variant="ghost" size="sm" onPress={onRetry} />
        ) : null}
        <Text variant="caption" color="textMuted">
          You can change your {me.role === 'CUSTOMER' ? 'name, phone, address and marketing preference' : 'name and phone number'}. {MANAGED_NOTE[me.role]}
        </Text>
      </Card>
    );
  }

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => {
    setForm({ ...form, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: '' });
  };
  const submit = () => {
    if (inFlight.current || !dirty) return;
    const local = fieldErrorsOf(changes);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    inFlight.current = true;
    save.mutate(changes, { onSettled: () => void (inFlight.current = false) });
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Label>Edit details</Label>
      <TextField label="First name" required value={form.firstName} onChangeText={(v) => set('firstName', v)} error={errors.firstName || undefined} autoComplete="given-name" testID="profile-first-name" maxLength={80} />
      <TextField label="Last name" required value={form.lastName} onChangeText={(v) => set('lastName', v)} error={errors.lastName || undefined} autoComplete="family-name" testID="profile-last-name" maxLength={80} />
      <TextField label="Phone" value={form.phone} onChangeText={(v) => set('phone', v)} error={errors.phone || undefined} keyboardType="phone-pad" autoComplete="tel" testID="profile-phone" maxLength={24} helper="e.g. +27 82 000 0000 or 082 000 0000" />
      {editable.includes('address') ? (
        <TextField label="Home / billing address" value={form.address} onChangeText={(v) => set('address', v)} error={errors.address || undefined} autoComplete="street-address" testID="profile-address" maxLength={300} helper="Job site addresses are entered per request." />
      ) : null}
      {editable.includes('marketingOptIn') ? <Checkbox checked={form.marketingOptIn} onChange={(v) => set('marketingOptIn', v)} label="Receive safety tips and offers" /> : null}
      <View style={{ gap: 2 }}>
        <Text variant="caption" color="textMuted">Email (sign-in) · read-only</Text>
        <Text variant="bodySmall" color="textSecondary">{me.email}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} disabled={save.isPending} testID="profile-cancel" onPress={() => {
          setForm(null);
          setErrors({});
        }} />
        <Button label="Save" style={{ flex: 1 }} loading={save.isPending} disabled={!dirty} testID="profile-save" onPress={submit} />
      </View>
      {!dirty ? <Text variant="caption" color="textFaint" align="center">No changes yet</Text> : null}
    </Card>
  );
}

/** Local-password change. Google-only accounts get an emailed link instead (proves the address). */
function PasswordCard({ me, onChanged }: { me: AuthUser; onChanged: () => Promise<void> }) {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next }),
    onSuccess: async () => {
      toast.success('Password changed — please sign in again.');
      await onChanged();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_CURRENT_PASSWORD') setErrors({ current: e.message });
      else if (e instanceof ApiError) setErrors({ current: e.fieldErrors().currentPassword ?? '', next: e.fieldErrors().newPassword ?? '' });
      toast.error(errorMessage(e));
    },
  });
  const emailLink = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', { email: me.email }),
    onSuccess: () => toast.success(`We emailed a link to ${me.email} to create a password.`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.hasPassword === false) {
    return (
      <Card style={{ gap: spacing.md }}>
        <Label>Security</Label>
        <Text variant="bodySmall" color="textSecondary">You sign in with Google, so there is no HYDRA password to change. To also sign in with email and a password, we can email you a secure link to create one.</Text>
        <Button label="Email me a link to create a password" icon="mail" variant="secondary" loading={emailLink.isPending} onPress={() => !emailLink.isPending && emailLink.mutate()} />
      </Card>
    );
  }

  const submit = () => {
    if (inFlight.current) return;
    const e: Record<string, string> = {};
    if (!pw.current) e.current = 'Enter your current password';
    if (pw.next.length < 12) e.next = 'At least 12 characters';
    else if (pw.next === pw.current) e.next = 'Choose a password different from your current one';
    if (pw.confirm !== pw.next) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length) return;
    inFlight.current = true;
    change.mutate(undefined, { onSettled: () => void (inFlight.current = false) });
  };
  const set = (k: keyof typeof pw, v: string) => {
    setPw({ ...pw, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: '' });
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Label>Security</Label>
      <TextField label="Current password" value={pw.current} onChangeText={(v) => set('current', v)} error={errors.current || undefined} secureTextEntry autoComplete="current-password" testID="pw-current" />
      <TextField label="New password" value={pw.next} onChangeText={(v) => set('next', v)} error={errors.next || undefined} secureTextEntry autoComplete="new-password" helper="At least 12 characters. You will be signed out on every device." testID="pw-new" />
      <TextField label="Confirm new password" value={pw.confirm} onChangeText={(v) => set('confirm', v)} error={errors.confirm || undefined} secureTextEntry autoComplete="new-password" testID="pw-confirm" />
      <Button label="Change password" icon="lock" variant="secondary" disabled={!pw.current || !pw.next || !pw.confirm} loading={change.isPending} onPress={submit} testID="pw-submit" />
    </Card>
  );
}

/** Per-device push preference; in-app notifications remain available in the Notifications screen. */
function NotificationPreferences() {
  if (Platform.OS === 'web') {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Label>Notifications</Label>
        <Text variant="bodySmall" color="textMuted">Push alerts are delivered to the PSG Electrical phone app. In the browser, updates appear in your notification list.</Text>
      </Card>
    );
  }
  return <DevicePushPreference />;
}

function DevicePushPreference() {
  const qc = useQueryClient();
  const pref = useQuery({ queryKey: ['push-pref'], queryFn: isPushEnabled });
  const [busy, setBusy] = useState(false);
  const enabled = pref.data ?? true;
  return (
    <Card style={{ gap: spacing.md }}>
      <Label>Notifications</Label>
      <Checkbox
        checked={enabled}
        onChange={(next) => {
          if (busy) return;
          setBusy(true);
          void setPushEnabled(next)
            .then((r) => {
              qc.setQueryData(['push-pref'], next);
              if (r === 'denied') toast.info('Notifications are blocked for PSG Electrical in your phone settings.');
              else toast.success(next ? 'Push notifications turned on for this device' : 'Push notifications turned off for this device');
            })
            .catch((e: unknown) => toast.error(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
        label="Push notifications on this device (quotes, scheduling, arrival, invoices, payments)"
      />
      <Text variant="caption" color="textMuted">Updates always appear in the in-app notification list. You can also manage alerts in your phone's settings.</Text>
      <Button label="Open phone notification settings" icon="settings" variant="ghost" size="sm" fullWidth={false} onPress={() => void Linking.openSettings().catch(() => toast.info('Open Settings › Apps › PSG Electrical › Notifications.'))} />
    </Card>
  );
}
