import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { loginSchema, type AuthSession, type LoginInput } from '@hydra/shared';
import { ApiError, apiRequest, errorMessage } from '../../api/client';
import { AuthShell } from '../../components/AuthShell';
import { Button, Checkbox, Divider, Segmented, Text, TextField, colors, spacing, toast } from '../../design-system';
import { googleSignInNotice, signInWithGoogle } from '../../features/googleSignIn';
import { useAuth } from '../../store/auth';

type Audience = 'customer' | 'staff';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ audience?: string }>();
  // Presentation only: both tabs use the same endpoint and the API decides the role.
  const [audience, setAudience] = useState<Audience>(params.audience === 'staff' ? 'staff' : 'customer');
  const setSession = useAuth((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleNotice = googleSignInNotice();
  const [consentNeeded, setConsentNeeded] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const { control, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: '', password: '' } });

  const finish = async (s: AuthSession) => {
    await setSession(s);
    // The entry route picks the app from the API-issued role (never from this screen's tab).
    router.replace('/');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await finish(await apiRequest<AuthSession>('POST', '/auth/login', { body: values, auth: false }));
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  const google = async (idToken?: string) => {
    setGoogleBusy(true);
    setFormError(null);
    try {
      const token = idToken ?? (await signInWithGoogle().then((r) => (r.ok ? r.idToken : (r.reason !== 'cancelled' && toast.error(r.message), null))));
      if (!token) return;
      try {
        await finish(await apiRequest<AuthSession>('POST', '/auth/google', { body: { idToken: token, acceptPrivacyPolicy: consent || undefined }, auth: false }));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'CONSENT_REQUIRED') setConsentNeeded(token);
        else setFormError(errorMessage(e));
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle={audience === 'staff' ? 'Electricians, office staff and management: use your work email or staff number.' : 'Track your jobs, quotes, invoices and rewards.'}
    >
      <View style={{ gap: spacing.lg }}>
        <Segmented<Audience>
          value={audience}
          onChange={setAudience}
          options={[{ value: 'customer', label: 'Customer sign in', icon: 'home' }, { value: 'staff', label: 'Staff sign in', icon: 'briefcase' }]}
        />
        <Controller control={control} name="identifier" render={({ field }) => (
          <TextField label={audience === 'staff' ? 'Work email or staff number' : 'Email'} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="username" textContentType="username" icon="user" error={formState.errors.identifier?.message} testID="login-identifier" />
        )} />
        <Controller control={control} name="password" render={({ field }) => (
          <TextField label="Password" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} secureTextEntry autoComplete="current-password" textContentType="password" icon="lock" error={formState.errors.password?.message} testID="login-password" onSubmitEditing={() => void onSubmit()} />
        )} />
        {formError ? <Text variant="bodySmall" color="dangerBright" accessibilityLiveRegion="polite" testID="login-error">{formError}</Text> : null}
        <Button label="Sign in" icon="log-in" loading={formState.isSubmitting} onPress={() => void onSubmit()} testID="login-submit" />
        <Link href="/forgot-password" style={{ alignSelf: 'center' }}><Text variant="bodySmall" color="primaryBright">Forgot password?</Text></Link>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Divider style={{ flex: 1 }} />
        <Text variant="caption" color="textMuted">OR</Text>
        <Divider style={{ flex: 1 }} />
      </View>

      {consentNeeded ? (
        <View style={{ gap: spacing.md, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
          <Text variant="title" weight="bold">Create your account with Google</Text>
          <Checkbox checked={consent} onChange={setConsent} label="I have read the privacy notice and agree to PSG Electrical processing my information to provide services (POPIA)." />
          <Button label="Continue" disabled={!consent} loading={googleBusy} onPress={() => void google(consentNeeded)} />
          <Link href="/privacy" style={{ alignSelf: 'center' }}><Text variant="caption" color="primaryBright">Read the privacy notice</Text></Link>
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Button label={googleNotice ? 'Google Sign-In unavailable' : 'Continue with Google'} icon="globe" variant="secondary" loading={googleBusy} disabled={!!googleNotice} onPress={() => void google()} accessibilityHint={googleNotice ?? undefined} />
          {googleNotice ? <Text variant="caption" color="textMuted" align="center" testID="google-signin-notice">{googleNotice}</Text> : null}
        </View>
      )}

      {audience === 'customer' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Text variant="bodySmall" color="textMuted">New customer?</Text>
          <Link href="/register"><Text variant="bodySmall" color="primaryBright" weight="bold">Create an account</Text></Link>
        </View>
      ) : null}
      <Text variant="caption" color="textFaint" align="center">
        {audience === 'staff'
          ? 'Staff accounts are created by the office. Your electrician, office or owner workspace opens automatically after sign-in. Google sign-in works for staff only after linking it from your profile.'
          : 'One sign-in for everyone — staff are taken to their workspace automatically.'}
      </Text>
      <Button label="Continue as guest" variant="ghost" size="sm" onPress={() => {
        useAuth.getState().continueAsGuest();
        router.replace('/home');
      }} />
    </AuthShell>
  );
}
