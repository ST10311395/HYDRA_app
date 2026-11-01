/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { QuickLinks } from '../../../components/QuickLinks';
import { Label, spacing } from '../../../design-system';
import { ProfileScreen } from '../../../features/ProfileScreen';
import { View } from 'react-native';

/** Account hub (Part 3): rewards, notifications and records that are not on the tab bar, then the profile. */
export default function CustomerProfile() {
  return (
    <ProfileScreen
      top={
        <View style={{ gap: spacing.sm }} testID="account-links">
          <Label>My account</Label>
          <QuickLinks links={[
            { icon: 'gift', label: 'Rewards', route: '/customer/rewards' },
            { icon: 'bell', label: 'Notifications', route: '/customer/notifications' },
            { icon: 'award', label: 'Compliance certificates', route: '/customer/jobs?filter=CERTIFICATES' },
            { icon: 'cpu', label: 'Smart Quote assessments', route: '/customer/ai' },
            { icon: 'globe', label: 'About PSG & services', route: '/home' },
          ]} />
        </View>
      }
    />
  );
}
