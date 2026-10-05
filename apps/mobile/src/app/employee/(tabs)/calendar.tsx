/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
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
