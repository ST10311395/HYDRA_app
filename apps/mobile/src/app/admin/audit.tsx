/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { AuditLogDto } from '@hydra/shared';
import { flatten, useAudit } from '../../api/queries';
import { AdminList, OwnerGate } from '../../components/admin';
import { Accordion, Card, FilterChips, SearchField, Text, spacing } from '../../design-system';
import { fmtDateTime } from '../../utils/format';

const ENTITY_FILTERS = [
  { value: 'ALL', label: 'All' }, { value: 'user', label: 'Security' }, { value: 'job', label: 'Jobs' }, { value: 'quote', label: 'Quotes' },
  { value: 'invoice', label: 'Invoices' }, { value: 'payment', label: 'Payments' }, { value: 'material', label: 'Stock' }, { value: 'payroll', label: 'Payroll' },
  { value: 'data_export', label: 'Exports' }, { value: 'missed_call', label: 'Missed calls' },
] as const;
type EntityFilter = (typeof ENTITY_FILTERS)[number]['value'];

const label = (a: string) => a.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Append-only audit trail (spec §17.5). Owner-only; the database blocks UPDATE/DELETE on audit_logs. */
export default function Audit() {
  return (
    <OwnerGate section="Audit Log">
      <AuditInner />
    </OwnerGate>
  );
}

function AuditInner() {
  const [entity, setEntity] = useState<EntityFilter>('ALL');
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAction(actionInput.trim().toUpperCase().replace(/\s+/g, '_')), 400);
    return () => clearTimeout(t);
  }, [actionInput]);
  const q = useAudit({ entityType: entity === 'ALL' ? undefined : entity, action: action || undefined });

  return (
    <AdminList<AuditLogDto>
      section="Audit Log"
      items={flatten(q.data)}
      query={q}
      emptyIcon="list"
      emptyTitle="No matching audit entries"
      header={
        <>
          <SearchField value={actionInput} onChangeText={setActionInput} placeholder="Filter by action, e.g. LOGIN_FAILED" />
          <FilterChips value={entity} onChange={setEntity} options={[...ENTITY_FILTERS]} />
          <Text variant="caption" color="textMuted">Entries are append-only and cannot be edited or deleted. Tokens, passwords and card data are never recorded.</Text>
        </>
      }
      renderItem={({ item: a }) => (
        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text variant="title" weight="bold" style={{ flex: 1 }}>{label(a.action)}</Text>
            <Text variant="caption" color="textMuted">{fmtDateTime(a.createdAt)}</Text>
          </View>
          <Text variant="caption" color="textSecondary">{a.actorName ?? 'System'}{a.actorRole ? ` · ${a.actorRole}` : ''} · {a.entityType}{a.entityId ? ` ${a.entityId.slice(0, 8)}` : ''}</Text>
          {a.metadata && Object.keys(a.metadata).length ? (
            <Accordion title="Details">
              <Text variant="mono" color="textMuted" style={{ fontSize: 11 }}>{JSON.stringify(a.metadata, null, 2)}</Text>
              {a.requestId ? <Text variant="caption" color="textFaint">Request {a.requestId}{a.ip ? ` · ${a.ip}` : ''}</Text> : null}
            </Accordion>
          ) : null}
        </Card>
      )}
    />
  );
}
