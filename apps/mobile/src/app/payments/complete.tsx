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
