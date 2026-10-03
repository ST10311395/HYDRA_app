import { useLocalSearchParams } from 'expo-router';
import { MaterialsLogger } from '../../../features/MaterialsLogger';

export default function AdminJobMaterials() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MaterialsLogger jobId={id} />;
}
