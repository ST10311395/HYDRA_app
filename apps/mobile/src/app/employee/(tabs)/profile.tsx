/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { View } from 'react-native';
import { QuickLinks } from '../../../components/QuickLinks';
import { Label, spacing } from '../../../design-system';
import { ProfileScreen } from '../../../features/ProfileScreen';

/** “More” for electricians (Part 3): the rest of the working day grouped in one place, then the profile. */
export default function EmployeeProfile() {
  return (
    <ProfileScreen
      top={
        <View style={{ gap: spacing.sm }} testID="employee-more">
          <Label>My work</Label>
          <QuickLinks links={[
            { icon: 'briefcase', label: 'All assigned jobs', route: '/employee/jobs' },
            { icon: 'package', label: 'Log materials', route: '/employee/jobs?focus=materials' },
            { icon: 'award', label: 'Inspection / CoC', route: '/employee/jobs?focus=inspection' },
            { icon: 'sun', label: 'My leave requests', route: '/employee/leave' },
            { icon: 'bell', label: 'Notifications', route: '/employee/notifications' },
            { icon: 'phone', label: 'Contact the office', route: '/contact' },
          ]} />
        </View>
      }
    />
  );
}
