/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { email as emailSchema } from '@hydra/shared';
import { apiRequest, errorMessage } from '../../api/client';
import { AuthShell } from '../../components/AuthShell';
import { Button, Card, Icon, Text, TextField, spacing } from '../../design-system';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!emailSchema.safeParse(email).success) return setError('Enter a valid email address');
    setError(null);
    setBusy(true);
    try {
      await apiRequest('POST', '/auth/forgot-password', { body: { email }, auth: false });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a secure link that expires in 30 minutes.">
      {sent ? (
        <Card accent="success" style={{ gap: spacing.md }}>
          <Icon name="mail" size={24} color="success" />
          <Text variant="title" weight="bold">Check your inbox</Text>
          <Text variant="bodySmall" color="textMuted">If an account exists for {email}, a reset link is on its way. Open it on this device to choose a new password.</Text>
          <Link href="/login"><Text variant="bodySmall" color="primaryBright">Back to sign in</Text></Link>
        </Card>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" icon="mail" error={error ?? undefined} />
          <Button label="Send reset link" loading={busy} onPress={() => void submit()} />
          <Link href="/reset-password" style={{ alignSelf: 'center' }}><Text variant="caption" color="primaryBright">I already have a reset code</Text></Link>
        </View>
      )}
    </AuthShell>
  );
}
