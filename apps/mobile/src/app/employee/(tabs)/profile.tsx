import { router } from 'expo-router';
import { ProfileScreen } from '../../../features/ProfileScreen';
import { SegmentLink } from '../../../components/jobs';

export default function EmployeeProfile() {
  return <ProfileScreen extra={<SegmentLink icon="sun" label="My leave requests" onPress={() => router.push('/employee/leave')} />} />;
}
