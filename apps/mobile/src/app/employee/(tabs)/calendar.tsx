import { View } from 'react-native';
import { BrandHeader } from '../../../components/layout';
import { colors } from '../../../design-system';
import { ScheduleView } from '../../../features/ScheduleView';

export default function EmployeeCalendar() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="My Calendar" />
      <ScheduleView jobRoute={(id) => `/employee/job/${id}`} />
    </View>
  );
}
