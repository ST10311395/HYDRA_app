import { useLocalSearchParams } from 'expo-router';
import { InspectionReportView } from '../../../features/InspectionReportView';

export default function AdminReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InspectionReportView id={id} />;
}
