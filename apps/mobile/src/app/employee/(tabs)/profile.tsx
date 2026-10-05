/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { ProfileScreen } from '../../../features/ProfileScreen';
import { SegmentLink } from '../../../components/jobs';

export default function EmployeeProfile() {
  return <ProfileScreen extra={<SegmentLink icon="sun" label="My leave requests" onPress={() => router.push('/employee/leave')} />} />;
}
