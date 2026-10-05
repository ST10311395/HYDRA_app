/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { password as passwordSchema } from '@hydra/shared';
import { apiRequest, errorMessage } from '../../api/client';
import { AuthShell } from '../../components/AuthShell';
import { Button, Text, TextField, spacing, toast } from '../../design-system';

/** Opened from the emailed link hydra://reset-password?token=… (single-use, 30-minute token). */
export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (token.trim().length < 20) e.token = 'Paste the code from your email link';
    const p = passwordSchema.safeParse(pw);
    if (!p.success) e.pw = p.error.issues[0]?.message ?? 'Invalid password';
    if (pw !== confirmPw) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await apiRequest('POST', '/auth/reset-password', { body: { token: token.trim(), password: pw }, auth: false });
      toast.success('Password updated — please sign in.');
      router.replace('/login');
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 12 characters. All other devices will be signed out.">
      <View style={{ gap: spacing.lg }}>
        {!params.token ? <TextField label="Reset code" value={token} onChangeText={setToken} autoCapitalize="none" error={errors.token} /> : null}
        <TextField label="New password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" icon="lock" error={errors.pw} />
        <TextField label="Confirm password" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" icon="lock" error={errors.confirm} />
        {errors.form ? <Text variant="bodySmall" color="dangerBright">{errors.form}</Text> : null}
        <Button label="Update password" loading={busy} onPress={() => void submit()} />
      </View>
    </AuthShell>
  );
}
