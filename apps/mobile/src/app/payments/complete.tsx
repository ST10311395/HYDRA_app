/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../../store/auth';

/**
 * Return target of the payment gateway (`hydra://payments/complete`, PAYMENT_CALLBACK_URL). The
 * invoice screen polls the payment status itself; this route only brings the user back to billing.
 */
export default function PaymentComplete() {
  const role = useAuth((s) => s.user?.role);
  return <Redirect href={role === 'CUSTOMER' ? '/customer/billing' : '/'} />;
}
