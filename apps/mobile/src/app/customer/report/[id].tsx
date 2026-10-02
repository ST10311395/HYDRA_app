import { useLocalSearchParams } from 'expo-router';
import { InspectionReportView } from '../../../features/InspectionReportView';

export default function CustomerReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InspectionReportView id={id} />;
}
