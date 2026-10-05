import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useAiSettings, useKnowledgeEntry, useKnowledgeMutation } from '../../../api/ai';
import { errorMessage, newIdempotencyKey } from '../../../api/client';
import { useIsOwner } from '../../../components/admin';
import { BrandHeader, Screen } from '../../../components/layout';
import { QueryFallback } from '../../../components/QueryState';
import { Badge, Button, Card, KeyValue, Label, Segmented, SelectField, Text, TextField, colors, confirm, spacing, toast } from '../../../design-system';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { fmtDateTime } from '../../../utils/format';

type Sev = '1' | '2' | '3' | '4' | '5';
const empty = { title: '', serviceCategory: 'FAULT_FINDING', problemSummary: '', symptoms: '', severity: '2' as Sev, pricingContext: '', recommendedResponse: '', clarifyingQuestions: '', keywords: '' };
const list = (v: string) => v.split(/[\n,]/).map((x) => x.trim()).filter((x) => x.length >= 2);

/** View / edit one knowledge entry (`new` creates). Owner: archive & delete. Every edit is a new version. */
export default function KnowledgeEntry() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const q = useKnowledgeEntry(id);
  const settings = useAiSettings();
  const owner = useIsOwner();
  const m = useKnowledgeMutation();
  const [f, setF] = useState(empty);
  const [changeNote, setChangeNote] = useState('');
  const [createKey] = useState(newIdempotencyKey);
  const busy = useRef(false);
  const k = q.data;
  useSyncFrom(k, (x) =>
    setF({
      title: x.title, serviceCategory: x.serviceCategory, problemSummary: x.problemSummary, symptoms: x.symptoms.join('\n'), severity: String(x.severity) as Sev,
      pricingContext: x.pricingContext ?? '', recommendedResponse: x.recommendedResponse, clarifyingQuestions: x.clarifyingQuestions.join('\n'), keywords: x.keywords.join(', '),
    }),
  );

  const body = {
    title: f.title.trim(), serviceCategory: f.serviceCategory, problemSummary: f.problemSummary.trim(), symptoms: list(f.symptoms), severity: Number(f.severity),
    pricingContext: f.pricingContext.trim() || undefined, recommendedResponse: f.recommendedResponse.trim(), clarifyingQuestions: list(f.clarifyingQuestions).slice(0, 5), keywords: list(f.keywords).slice(0, 25),
  };
  const valid = body.title.length >= 5 && body.problemSummary.length >= 10 && body.recommendedResponse.length >= 10;

  const go = async (fn: () => Promise<unknown>, done: string, after?: () => void) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
      toast.success(done);
      after?.();
      void q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy.current = false;
    }
  };

  const save = () =>
    isNew
      ? go(() => m.mutateAsync({ method: 'post', path: '/ai/knowledge', body, key: createKey }), 'Entry created', () => router.back())
      : go(() => m.mutateAsync({ method: 'patch', path: `/ai/knowledge/${id}`, body: { ...body, changeNote: changeNote.trim() } }), 'New version saved', () => setChangeNote(''));

  const categories = settings.data?.pricingPolicy.categories ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="AI Knowledge" back />
      <Screen withTabBar={false} onRefresh={isNew ? undefined : () => void q.refetch()} refreshing={q.isRefetching}>
        {!isNew && !k ? <QueryFallback query={q} /> : (
          <>
            {k ? (
              <Card style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Badge label={k.status} tone={k.status === 'APPROVED' ? 'success' : k.status === 'PENDING' ? 'warning' : 'neutral'} />
                  <Badge label={k.active ? 'ACTIVE' : 'INACTIVE'} tone={k.active ? 'primary' : 'neutral'} />
                  <Badge label={`Version ${k.version}`} tone="neutral" />
                </View>
                <KeyValue label="Approved by" value={k.approvedByName ? `${k.approvedByName} · ${fmtDateTime(k.approvedAt)}` : '—'} />
                <KeyValue label="Created by" value={k.createdByName ?? '—'} />
                <KeyValue label="Times retrieved" value={String(k.timesRetrieved)} />
                {k.sourceConversationId ? <Button label={`View source case ${k.sourceReference ?? ''}`} variant="ghost" icon="external-link" onPress={() => router.push(`/admin/ai-case/${k.sourceConversationId}`)} /> : null}
              </Card>
            ) : null}
            <Card style={{ gap: spacing.md }}>
              <Label>{isNew ? 'New knowledge entry' : 'Edit (creates a new version)'}</Label>
              <TextField label="Title" required value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={160} />
              <SelectField label="Service category" value={f.serviceCategory} onChange={(v) => setF({ ...f, serviceCategory: v })} options={categories.map((c) => ({ value: c.code, label: c.label }))} />
              <Text variant="title" weight="bold">Severity</Text>
              <Segmented value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={(['1', '2', '3', '4', '5'] as Sev[]).map((v) => ({ value: v, label: v }))} />
              <TextField label="Problem summary" required multiline value={f.problemSummary} onChangeText={(v) => setF({ ...f, problemSummary: v })} maxLength={1500} />
              <TextField label="Symptoms (one per line)" multiline value={f.symptoms} onChangeText={(v) => setF({ ...f, symptoms: v })} />
              <TextField label="Approved response / guidance" required multiline value={f.recommendedResponse} onChangeText={(v) => setF({ ...f, recommendedResponse: v })} maxLength={3000} helper="Assessment and service guidance only — never DIY repair steps." />
              <TextField label="Pricing context" multiline value={f.pricingContext} onChangeText={(v) => setF({ ...f, pricingContext: v })} maxLength={1000} />
              <TextField label="Clarifying questions (one per line)" multiline value={f.clarifyingQuestions} onChangeText={(v) => setF({ ...f, clarifyingQuestions: v })} />
              <TextField label="Keywords (comma separated)" value={f.keywords} onChangeText={(v) => setF({ ...f, keywords: v })} />
              {!isNew ? <TextField label="Change note" required value={changeNote} onChangeText={setChangeNote} maxLength={300} /> : null}
              <Button label={isNew ? 'Create entry' : 'Save new version'} icon="save" disabled={!valid || (!isNew && changeNote.trim().length < 3) || k?.status === 'ARCHIVED'} loading={m.isPending} onPress={() => void save()} />
            </Card>
            {k && k.status !== 'ARCHIVED' ? (
              <Card style={{ gap: spacing.sm }}>
                <Label>Lifecycle</Label>
                {k.status === 'PENDING' ? <Button label="Approve for AI retrieval" icon="check" onPress={() => void go(() => m.mutateAsync({ method: 'post', path: `/ai/knowledge/${id}/approve` }), 'Approved')} /> : null}
                {k.status === 'APPROVED' ? (
                  <Button label={k.active ? 'Deactivate' : 'Activate'} icon={k.active ? 'pause' : 'play'} variant="secondary" onPress={() => void go(() => m.mutateAsync({ method: 'post', path: `/ai/knowledge/${id}/active`, body: { active: !k.active } }), k.active ? 'Deactivated' : 'Activated')} />
                ) : null}
                {owner ? (
                  <>
                    <Button label="Archive" icon="archive" variant="outline" onPress={() => void go(() => m.mutateAsync({ method: 'post', path: `/ai/knowledge/${id}/archive` }), 'Archived')} />
                    <Button label="Delete permanently" icon="trash-2" variant="dangerOutline" onPress={() => void (async () => {
                      if (await confirm({ title: 'Delete this entry?', message: 'This cannot be undone. Past assessments keep their reference.', confirmLabel: 'Delete', destructive: true })) {
                        await go(() => m.mutateAsync({ method: 'delete', path: `/ai/knowledge/${id}` }), 'Deleted', () => router.back());
                      }
                    })()} />
                  </>
                ) : null}
              </Card>
            ) : null}
            {k?.revisions?.length ? (
              <Card style={{ gap: 4 }}>
                <Label>Revisions</Label>
                {k.revisions.map((r) => <Text key={r.version} variant="caption" color="textMuted">v{r.version} · {fmtDateTime(r.createdAt)} · {r.editedByName ?? '—'} · {r.changeNote ?? ''}</Text>)}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
