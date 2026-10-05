import { useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '../../api/client';
import { flatten, useDataRequests, useSimpleMutation, type DataRequestDto as DataRequest } from '../../api/queries';
import { AdminList, OwnerGate } from '../../components/admin';
import { Badge, Button, Card, Text, TextField, confirm, spacing, toast } from '../../design-system';
import { fmtDateTime } from '../../utils/format';

const TYPE_COPY: Record<DataRequest['type'], string> = {
  ACCESS: 'Access — send the person a copy of their data (they can also download it from their profile).',
  CORRECTION: 'Correction — update the inaccurate information, then record what changed.',
  DELETION: 'Deletion — completing this anonymises the account. Job, compliance, tax and payment records are retained as required by law.',
};

/** POPIA data-subject requests (spec §17.4): access, correction and deletion/anonymisation. Owner-only. */
export default function DataRequests() {
  return (
    <OwnerGate section="Data Requests">
      <Inner />
    </OwnerGate>
  );
}

function Inner() {
  const q = useDataRequests();
  return (
    <AdminList<DataRequest>
      section="Data Requests"
      items={flatten(q.data)}
      query={q}
      emptyIcon="shield"
      emptyTitle="No data-subject requests"
      emptyMessage="Customers and staff submit these from Profile → Privacy."
      renderItem={({ item }) => <RequestCard r={item} />}
    />
  );
}

function RequestCard({ r }: { r: DataRequest }) {
  const [resolution, setResolution] = useState('');
  const resolve = useSimpleMutation((status: 'COMPLETED' | 'REJECTED') => api.post(`/data-requests/${r.id}/resolve`, { status, resolution: resolution.trim() }), [['data-requests']]);
  const open = r.status === 'OPEN';
  const run = async (status: 'COMPLETED' | 'REJECTED') => {
    if (status === 'COMPLETED' && r.type === 'DELETION' && !(await confirm({ title: 'Anonymise this account?', message: 'Personal details are irreversibly replaced and all sessions revoked. Legally required records are kept.', confirmLabel: 'Anonymise', destructive: true }))) return;
    resolve.mutate(status, { onSuccess: () => toast.success('Request resolved'), onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Card accent={open ? 'primary' : 'none'} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title" weight="bold">{r.type}</Text>
        <Badge label={r.status} tone={r.status === 'COMPLETED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'} />
      </View>
      <Text variant="caption" color="textMuted">{r.email} · {r.role} · {fmtDateTime(r.createdAt)}</Text>
      {r.details ? <Text variant="bodySmall" color="textSecondary">{r.details}</Text> : null}
      {r.resolution ? <Text variant="caption" color="textFaint">Resolution: {r.resolution}</Text> : null}
      {open ? (
        <>
          <Text variant="caption" color="secondaryBright">{TYPE_COPY[r.type]}</Text>
          <TextField placeholder="Resolution notes (sent to the audit log)" value={resolution} onChangeText={setResolution} multiline maxLength={1000} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Reject" size="sm" variant="dangerOutline" style={{ flex: 1 }} disabled={resolution.trim().length < 3 || resolve.isPending} onPress={() => void run('REJECTED')} />
            <Button label={r.type === 'DELETION' ? 'Anonymise' : 'Complete'} size="sm" style={{ flex: 1 }} disabled={resolution.trim().length < 3} loading={resolve.isPending} onPress={() => void run('COMPLETED')} />
          </View>
        </>
      ) : null}
    </Card>
  );
}
