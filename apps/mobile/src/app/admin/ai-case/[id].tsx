/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AI_ESCALATION_REASON_LABELS, type AiCaseDetailDto } from '@hydra/shared';
import { useAiCase, useAiCaseAction, useAiSettings } from '../../../api/ai';
import { errorMessage, newIdempotencyKey } from '../../../api/client';
import { useServices } from '../../../api/queries';
import { parseAmount } from '../../../components/admin';
import { BrandHeader, Screen } from '../../../components/layout';
import { QueryFallback } from '../../../components/QueryState';
import { Accordion, Badge, Button, Card, Checkbox, KeyValue, Label, Segmented, SelectField, Text, TextField, colors, confirm, radius, spacing, toast } from '../../../design-system';
import { ConfidenceBar, MessageBubble, SeverityPill, SimulationBanner } from '../../../features/ai/components';
import { fmtDateTime, money } from '../../../utils/format';

type Sev = '1' | '2' | '3' | '4' | '5';

/** Admin case screen: everything needed to understand why the case escalated and to resolve it. */
export default function AiCase() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useAiCase(id);
  const c = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="AI Review" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!c ? <QueryFallback query={q} /> : <CaseBody c={c} />}
      </Screen>
    </View>
  );
}

function CaseBody({ c }: { c: AiCaseDetailDto }) {
  const act = useAiCaseAction(c.id);
  const settings = useAiSettings();
  const services = useServices();
  const a = c.assessment;
  const can = (x: string) => c.allowedActions.includes(x);
  const keys = useRef<Record<string, string>>({});
  const keyFor = (n: string) => (keys.current[n] ??= newIdempotencyKey());
  const busy = useRef(false);

  const [reply, setReply] = useState('');
  const [requestInfo, setRequestInfo] = useState(false);
  const [sev, setSev] = useState<Sev>(String(a?.severity ?? 2) as Sev);
  const [category, setCategory] = useState(a?.serviceCategory ?? '');
  const [summary, setSummary] = useState(a?.summary ?? '');
  const [pMin, setPMin] = useState(a?.adminPrice ? String(a.adminPrice.min) : '');
  const [pMax, setPMax] = useState(a?.adminPrice ? String(a.adminPrice.max) : '');
  const [note, setNote] = useState('');
  const [proposalMsg, setProposalMsg] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState<string | undefined>();
  const [siteAddress, setSiteAddress] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [fb, setFb] = useState({ assessmentVerdict: c.adminFeedback?.assessmentVerdict ?? 'CORRECT', severityVerdict: c.adminFeedback?.severityVerdict ?? 'CORRECT', priceVerdict: c.adminFeedback?.priceVerdict ?? 'ACCURATE' });
  const [k, setK] = useState({ title: c.title, problemSummary: a?.summary ?? c.firstMessage, recommendedResponse: '', keywords: '', pricingContext: '' });

  const run = async (name: string, action: string, body: object, done: string, idempotent = true) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await act.mutateAsync({ action, body, key: idempotent ? keyFor(name) : undefined });
      delete keys.current[name];
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const priceMin = parseAmount(pMin);
  const priceMax = parseAmount(pMax);
  const priceGiven = pMin !== '' || pMax !== '';
  const priceValid = !priceGiven || (Number.isFinite(priceMin) && Number.isFinite(priceMax) && priceMin > 0 && priceMin <= priceMax);
  const categories = settings.data?.pricingPolicy.categories ?? [];

  return (
    <>
      <View style={styles.between}>
        <View style={{ flexShrink: 1 }}>
          <Text variant="mono" color="primaryBright">{c.reference}</Text>
          <Text variant="h3">{c.customerName}</Text>
          <Text variant="caption" color="textMuted">{c.customer.email}{c.customer.phone ? ` · ${c.customer.phone}` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {c.severity ? <SeverityPill severity={c.severity} /> : null}
          <Badge label={c.statusLabel} tone="neutral" mono={false} />
        </View>
      </View>
      {c.isSimulation ? <SimulationBanner label="Development AI simulation" /> : null}
      {c.escalationReasons.length ? (
        <Card accent="secondary" style={{ gap: 4 }} testID="ai-escalation-reasons">
          <Label color="secondaryBright">Why this case needs review</Label>
          {c.escalationReasons.map((r) => <Text key={r} variant="bodySmall">• {AI_ESCALATION_REASON_LABELS[r]}</Text>)}
        </Card>
      ) : null}
      {c.jobId ? <Button label={`Open job ${c.jobReference}`} icon="briefcase" variant="secondary" onPress={() => router.push(`/admin/job/${c.jobId}`)} /> : null}

      <Card style={{ gap: spacing.sm }}>
        <Label>Customer problem</Label>
        <Text variant="body">{c.firstMessage}</Text>
        <Text variant="caption" color="textMuted">{[c.propertyType, c.siteArea, c.urgency ? `stated urgency ${c.urgency}` : null].filter(Boolean).join(' · ')}</Text>
        {c.attachments.length ? (
          <View style={styles.images}>
            {c.attachments.map((p) => (
              <View key={p.id} style={{ gap: 2 }}>
                <Image source={{ uri: p.url }} style={styles.image} contentFit="cover" accessibilityLabel={`Customer photo ${p.fileName}`} />
                <Text variant="caption" color="textMuted">{p.analysisStatus === 'UNAVAILABLE' ? 'Not AI-analysed' : p.analysisStatus.toLowerCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Accordion title={`Conversation (${c.messages.length})`} defaultOpen>
        <View style={{ gap: spacing.md }}>{c.messages.map((m) => <MessageBubble key={m.id} m={m} />)}</View>
      </Accordion>

      {a ? (
        <Card style={{ gap: spacing.md }} testID="ai-admin-assessment">
          <View style={styles.between}>
            <Label color="primaryBright">Assessment v{a.version} · {a.source === 'AI' ? 'AI' : a.source === 'ADMIN' ? `edited by ${a.createdByName ?? 'admin'}` : 'rules only (no AI output)'}</Label>
            <Badge label={a.outcome.replace(/_/g, ' ')} tone="neutral" />
          </View>
          <Text variant="body">{a.summary}</Text>
          <KeyValue label="Service category" value={a.serviceCategoryLabel} />
          <KeyValue label="Severity (AI → rules floor → final)" value={`${a.aiSeverity ?? '—'} → ${a.ruleSeverityFloor ?? '—'} → ${a.severity} ${a.severityName}`} />
          <Text variant="caption" color="textMuted">{a.severityReason}</Text>
          <KeyValue label="Confidence (AI → final)" value={`${a.aiConfidence ?? '—'}% → ${a.confidence}%`} />
          <ConfidenceBar value={a.confidence} />
          {a.safetyTriggers.length ? (
            <View style={{ gap: 4 }}>
              <Label>Safety rules</Label>
              {a.safetyTriggers.map((t) => (
                <Text key={t.code} variant="bodySmall" color={t.negated ? 'textMuted' : 'dangerBright'}>
                  {t.negated ? '○ (negated) ' : '● '}{t.label} — “{t.matched}” → min {t.minSeverity}
                </Text>
              ))}
            </View>
          ) : null}
          <Label>Retrieved knowledge</Label>
          {a.retrievedKnowledge.length ? a.retrievedKnowledge.map((r) => (
            <Text key={r.id} variant="bodySmall" color="primaryBright" onPress={() => router.push(`/admin/ai-entry/${r.id}`)}>• {r.title} (v{r.version}, score {r.score})</Text>
          )) : <Text variant="caption" color="textMuted">No approved knowledge matched.</Text>}
          <Label>Price calculation</Label>
          {a.systemEstimate ? (
            <View style={styles.inset}>
              <KeyValue label="System-calculated range" value={`${money(a.systemEstimate.min)} – ${money(a.systemEstimate.max)}`} />
              {a.adminPrice ? <KeyValue label="Admin-approved range" value={`${money(a.adminPrice.min)} – ${money(a.adminPrice.max)}`} valueColor="success" /> : null}
              {a.systemEstimate.basis.map((b) => <Text key={b} variant="caption" color="textSecondary">• {b}</Text>)}
              {a.aiInputs?.labourHours ? <Text variant="caption" color="textMuted">AI-suggested labour: {a.aiInputs.labourHours.min}–{a.aiInputs.labourHours.max} h (inputs only — never shown directly)</Text> : null}
              {a.historicalReference ? <Text variant="caption" color="textMuted">Approved history ({a.historicalReference.sampleSize} jobs): median {money(a.historicalReference.median)}</Text> : null}
            </View>
          ) : null}
          <Accordion title="AI audit trail">
            <View style={{ gap: 4 }}>
              <KeyValue label="Provider / model" value={`${a.provider} / ${a.model}`} mono />
              <KeyValue label="Prompt version" value={a.promptVersion} mono />
              <KeyValue label="Policy versions" value={`settings v${a.settingsVersion} · severity v${a.severityPolicyVersion} · pricing v${a.pricingPolicyVersion}`} />
              {a.errorCode ? <KeyValue label="Error" value={a.errorCode} valueColor="dangerBright" /> : null}
              {c.providerCalls.map((p) => <Text key={p.id} variant="caption" color="textMuted">{fmtDateTime(p.createdAt)} · {p.provider} attempt {p.attempt}: {p.status} ({p.latencyMs} ms)</Text>)}
            </View>
          </Accordion>
        </Card>
      ) : null}

      {c.proposal ? (
        <Card accent={c.proposal.status === 'ACCEPTED' ? 'success' : 'primary'} style={{ gap: 4 }}>
          <Label>Proposal · {c.proposal.status}</Label>
          <Text variant="h3">{money(c.proposal.priceMin)} – {money(c.proposal.priceMax)}</Text>
          <Text variant="caption" color="textMuted">{c.proposal.priceSource === 'ADMIN' ? 'Admin-approved price' : 'System-calculated price'} · {c.proposal.approvedByAdmin ? 'sent by the team' : 'presented by AI'}</Text>
          {c.proposal.acceptedAt ? <Text variant="caption" color="success">Customer accepted AI preliminary proposal · {fmtDateTime(c.proposal.acceptedAt)}</Text> : null}
        </Card>
      ) : null}

      {can('REPLY') ? (
        <Card style={{ gap: spacing.md }} testID="ai-admin-reply">
          <Label>Reply to customer (shown as “PSG Electrical team response”)</Label>
          <TextField multiline value={reply} onChangeText={setReply} placeholder="Write your reply…" maxLength={2000} testID="ai-admin-reply-text" />
          <Checkbox checked={requestInfo} onChange={setRequestInfo} label="This asks the customer for more information" />
          <Button label="Send reply" icon="send" disabled={reply.trim().length < 2} loading={act.isPending} onPress={() => void run('reply', 'reply', { body: reply.trim(), requestInformation: requestInfo }, 'Reply sent').then((ok) => ok && setReply(''))} testID="ai-admin-send-reply" />
        </Card>
      ) : null}

      {can('EDIT') && a ? (
        <Card style={{ gap: spacing.md }} testID="ai-admin-editor">
          <Label>Edit assessment</Label>
          <TextField label="Summary" multiline value={summary} onChangeText={setSummary} maxLength={600} />
          <SelectField label="Service category" value={category || undefined} onChange={setCategory} options={categories.map((x) => ({ value: x.code, label: x.label }))} />
          <Text variant="title" weight="bold">Severity</Text>
          <Segmented value={sev} onChange={setSev} options={(['1', '2', '3', '4', '5'] as Sev[]).map((v) => ({ value: v, label: v }))} />
          {a.ruleSeverityFloor && Number(sev) < a.ruleSeverityFloor ? <Text variant="caption" color="warning">Below the safety-rule floor ({a.ruleSeverityFloor}). Explain why in the note — this is recorded.</Text> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><TextField label="Price min (R)" value={pMin} onChangeText={setPMin} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><TextField label="Price max (R)" value={pMax} onChangeText={setPMax} keyboardType="decimal-pad" error={priceValid ? undefined : 'Check range'} /></View>
          </View>
          <TextField label="Reason for change" required value={note} onChangeText={setNote} maxLength={500} testID="ai-admin-edit-note" />
          <Button label="Save new assessment version" icon="save" variant="secondary" disabled={note.trim().length < 3 || !priceValid} loading={act.isPending}
            onPress={() => void run('edit', 'assessment', {
              summary: summary.trim() !== a.summary ? summary.trim() : undefined,
              serviceCategory: category && category !== a.serviceCategory ? category : undefined,
              severity: Number(sev) !== a.severity ? Number(sev) : undefined,
              ...(priceGiven ? { priceMin, priceMax } : {}),
              note: note.trim(),
            }, 'Assessment updated', false).then((ok) => ok && setNote(''))} testID="ai-admin-save-edit" />
        </Card>
      ) : null}

      {can('APPROVE_AI') || can('SEND_PROPOSAL') ? (
        <Card style={{ gap: spacing.md }}>
          <Label>{can('APPROVE_AI') ? 'Approve AI response' : 'Send proposal'}</Label>
          <TextField label="Message to customer (optional)" multiline value={proposalMsg} onChangeText={setProposalMsg} maxLength={1000} />
          <Button label={can('APPROVE_AI') ? 'Approve & send to customer' : 'Send proposal'} icon="check-circle" loading={act.isPending} onPress={() => void run('proposal', 'proposal', { message: proposalMsg.trim() || undefined }, 'Proposal sent')} testID="ai-admin-send-proposal" />
        </Card>
      ) : null}

      {can('CONVERT') ? (
        <Card style={{ gap: spacing.md }}>
          <Label>Convert to job</Label>
          <SelectField label="Service type" value={serviceTypeId} onChange={setServiceTypeId} options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <TextField label="Site address" value={siteAddress} onChangeText={setSiteAddress} icon="map-pin" />
          <Button label="Create REQUESTED job" icon="briefcase" variant="secondary" disabled={!serviceTypeId || siteAddress.trim().length < 5} loading={act.isPending}
            onPress={() => void run('convert', 'convert', { serviceTypeId, siteAddress: siteAddress.trim() }, 'Job created')} />
        </Card>
      ) : null}

      {can('CREATE_KNOWLEDGE') ? (
        <Accordion title="Approve resolution as AI knowledge">
          <View style={{ gap: spacing.md }} testID="ai-admin-knowledge">
            <Text variant="caption" color="textMuted">Only what you write here becomes reusable knowledge. Customer messages and unreviewed AI output are never learned automatically.</Text>
            <TextField label="Title" value={k.title} onChangeText={(v) => setK({ ...k, title: v })} maxLength={160} />
            <TextField label="Problem summary" multiline value={k.problemSummary} onChangeText={(v) => setK({ ...k, problemSummary: v })} maxLength={1500} />
            <TextField label="Approved response / guidance" multiline value={k.recommendedResponse} onChangeText={(v) => setK({ ...k, recommendedResponse: v })} maxLength={3000} testID="ai-knowledge-response" />
            <TextField label="Pricing context (optional)" value={k.pricingContext} onChangeText={(v) => setK({ ...k, pricingContext: v })} maxLength={1000} />
            <TextField label="Keywords (comma separated)" value={k.keywords} onChangeText={(v) => setK({ ...k, keywords: v })} />
            <Button label="Save as knowledge" icon="book-open" variant="violet" disabled={k.title.trim().length < 5 || k.problemSummary.trim().length < 10 || k.recommendedResponse.trim().length < 10}
              onPress={() => void run('knowledge', 'knowledge', {
                title: k.title.trim(), serviceCategory: category || a?.serviceCategory || 'OTHER', problemSummary: k.problemSummary.trim(), severity: Number(sev),
                recommendedResponse: k.recommendedResponse.trim(), pricingContext: k.pricingContext.trim() || undefined,
                keywords: k.keywords.split(',').map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 25), symptoms: [], clarifyingQuestions: [],
              }, 'Knowledge saved')} testID="ai-knowledge-save" />
            {c.knowledgeEntries.map((e) => <Text key={e.id} variant="bodySmall" color="primaryBright" onPress={() => router.push(`/admin/ai-entry/${e.id}`)}>• {e.title} ({e.status})</Text>)}
          </View>
        </Accordion>
      ) : null}

      <Accordion title="Feedback on the AI assessment">
        <View style={{ gap: spacing.md }}>
          <Text variant="caption" color="textMuted">Used for analytics and retrieval quality only — it never changes pricing or safety rules.</Text>
          <Text variant="title" weight="bold">Assessment</Text>
          <Segmented value={fb.assessmentVerdict} onChange={(v) => setFb({ ...fb, assessmentVerdict: v })} options={[{ value: 'CORRECT', label: 'Correct' }, { value: 'PARTIALLY_CORRECT', label: 'Partly' }, { value: 'INCORRECT', label: 'Incorrect' }]} />
          <Text variant="title" weight="bold">Severity</Text>
          <Segmented value={fb.severityVerdict} onChange={(v) => setFb({ ...fb, severityVerdict: v })} options={[{ value: 'CORRECT', label: 'Correct' }, { value: 'TOO_LOW', label: 'Too low' }, { value: 'TOO_HIGH', label: 'Too high' }]} />
          <Text variant="title" weight="bold">Price range</Text>
          <Segmented value={fb.priceVerdict} onChange={(v) => setFb({ ...fb, priceVerdict: v })} options={[{ value: 'ACCURATE', label: 'Accurate' }, { value: 'TOO_LOW', label: 'Too low' }, { value: 'TOO_HIGH', label: 'Too high' }]} />
          <Button label="Save feedback" variant="secondary" onPress={() => void run('feedback', 'feedback', fb, 'Feedback saved', false)} />
        </View>
      </Accordion>

      {can('CLOSE') ? (
        <Card style={{ gap: spacing.md }}>
          <Label>Close case</Label>
          <TextField label="Reason (shown to the customer)" value={closeReason} onChangeText={setCloseReason} maxLength={500} />
          <Button label="Close case" icon="x-circle" variant="dangerOutline" disabled={closeReason.trim().length < 3}
            onPress={() => void (async () => {
              if (await confirm({ title: 'Close this case?', message: 'The customer will be notified.', confirmLabel: 'Close case', destructive: true })) await run('close', 'close', { reason: closeReason.trim() }, 'Case closed');
            })()} />
        </Card>
      ) : null}

      {c.reviews.length ? (
        <Accordion title={`Review history (${c.reviews.length})`}>
          <View style={{ gap: 4 }}>
            {c.reviews.map((r) => <Text key={r.id} variant="caption" color="textMuted">{fmtDateTime(r.createdAt)} · {r.adminName}: {r.action.replace(/_/g, ' ').toLowerCase()}{r.note ? ` — ${r.note}` : ''}</Text>)}
          </View>
        </Accordion>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' },
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  image: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  inset: { gap: 4, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceInset },
});
