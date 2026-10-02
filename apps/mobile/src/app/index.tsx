import { Redirect } from 'expo-router';
import { BootSplash } from '../components/BootSplash';
import { entryRoute } from '../navigation/guards';
import { useAuth } from '../store/auth';

/**
 * App entry. Sends a restored session to its role's app (role resolved by the API), a returning
 * guest to the public site, and everyone else to the welcome / sign-in gateway.
 */
export default function Entry() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const guest = useAuth((s) => s.guest);
  const target = entryRoute(status, user?.role, guest);
  if (!target) return <BootSplash />;
  if (target === '/customer' && user?.onboardingCompleted === false) return <Redirect href="/customer/onboarding" />;
  return <Redirect href={target} />;
}
