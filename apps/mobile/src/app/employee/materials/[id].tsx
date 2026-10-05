import { useLocalSearchParams } from 'expo-router';
import { MaterialsLogger } from '../../../features/MaterialsLogger';

export default function EmployeeMaterials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MaterialsLogger jobId={id} />;
}
