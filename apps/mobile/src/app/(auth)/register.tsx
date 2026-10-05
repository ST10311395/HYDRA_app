/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';
import { registerSchema, type AuthSession } from '@hydra/shared';
import { ApiError, apiRequest, errorMessage } from '../../api/client';
import { AuthShell } from '../../components/AuthShell';
import { Button, Checkbox, Text, TextField, spacing } from '../../design-system';
import { useAuth } from '../../store/auth';

type Form = z.input<typeof registerSchema>;

export default function RegisterScreen() {
  const setSession = useAuth((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError } = useForm<Form>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', password: '', address: '', acceptPrivacyPolicy: false as unknown as true, marketingOptIn: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const s = await apiRequest<AuthSession>('POST', '/auth/register', { body: values, auth: false });
      await setSession(s);
      // New customer accounts land on the guided onboarding via the entry route.
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError) Object.entries(e.fieldErrors()).forEach(([k, m]) => setError(k as keyof Form, { message: m }));
      setFormError(errorMessage(e));
    }
  });

  const field = (name: 'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'address', label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller control={control} name={name} render={({ field: f }) => (
      <TextField label={label} value={f.value ?? ''} onChangeText={f.onChange} onBlur={f.onBlur} error={formState.errors[name]?.message} {...extra} />
    )} />
  );

  return (
    <AuthShell title="Create your account" subtitle="Request services, approve quotes, track your electrician live and earn rewards.">
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>{field('firstName', 'First name', { autoComplete: 'given-name', required: true })}</View>
          <View style={{ flex: 1 }}>{field('lastName', 'Last name', { autoComplete: 'family-name', required: true })}</View>
        </View>
        {field('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', icon: 'mail', required: true })}
        {field('phone', 'Mobile number', { keyboardType: 'phone-pad', autoComplete: 'tel', icon: 'phone', placeholder: '+27 82 000 0000', required: true })}
        {field('address', 'Home address (optional)', { icon: 'home', autoComplete: 'street-address' })}
        {field('password', 'Password', { secureTextEntry: true, autoComplete: 'new-password', icon: 'lock', helper: 'At least 12 characters — a passphrase works well.', required: true })}
        <Controller control={control} name="acceptPrivacyPolicy" render={({ field: f }) => (
          <Checkbox
            checked={!!f.value}
            onChange={(v) => f.onChange(v)}
            error={formState.errors.acceptPrivacyPolicy?.message}
            label={<Text variant="bodySmall" color="textSecondary">I agree to the <Link href="/privacy"><Text variant="bodySmall" color="primaryBright">privacy notice</Text></Link> and consent to PSG Electrical processing my information to provide services (POPIA).</Text>}
          />
        )} />
        <Controller control={control} name="marketingOptIn" render={({ field: f }) => (
          <Checkbox checked={!!f.value} onChange={f.onChange} label="Send me occasional safety tips and offers (optional)." />
        )} />
        {formError ? <Text variant="bodySmall" color="dangerBright">{formError}</Text> : null}
        <Button label="Create account" loading={formState.isSubmitting} onPress={() => void onSubmit()} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text variant="bodySmall" color="textMuted">Already registered?</Text>
          <Link href="/login"><Text variant="bodySmall" color="primaryBright" weight="bold">Sign in</Text></Link>
        </View>
      </View>
    </AuthShell>
  );
}
