/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { View } from 'react-native';
import type { AiSettings, PricingPolicy, SeverityPolicy } from '@hydra/shared';
import { useAiSettings, useSaveAiSettings } from '../../api/ai';
import { errorMessage } from '../../api/client';
import { OwnerGate, parseAmount } from '../../components/admin';
import { BrandHeader, Screen } from '../../components/layout';
import { QueryFallback } from '../../components/QueryState';
import { Accordion, Badge, Button, Card, Checkbox, KeyValue, Label, Segmented, Text, TextField, colors, spacing, toast } from '../../design-system';
import { useSyncFrom } from '../../hooks/useSyncFrom';

/** Settings → AI Assistant (owner only; the API enforces ADMIN_OWNER on every write). */
export default function AiSettingsScreen() {
  return (
    <OwnerGate section="AI Assistant">
      <AiSettingsBody />
    </OwnerGate>
  );
}

const num = (v: string) => parseAmount(v);

function AiSettingsBody() {
  const q = useAiSettings();
  const save = useSaveAiSettings();
  const d = q.data;
  const [s, setS] = useState<AiSettings | null>(null);
  const [sev, setSev] = useState<SeverityPolicy | null>(null);
  const [pricing, setPricing] = useState<PricingPolicy | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [rule, setRule] = useState({ label: '', keywords: '', minSeverity: '5' as '3' | '4' | '5' });
  useSyncFrom(d, (x) => {
    setS(x.settings);
    setSev(x.severityPolicy);
    setPricing(x.pricingPolicy);
    setText({
      maxClarificationRounds: String(x.settings.maxClarificationRounds), proposalConfidenceThreshold: String(x.settings.proposalConfidenceThreshold),
      reviewConfidenceThreshold: String(x.settings.reviewConfidenceThreshold), knowledgeRetrievalCount: String(x.settings.knowledgeRetrievalCount),
      pricingTolerancePct: String(x.settings.pricingTolerancePct), maxImagesPerConversation: String(x.settings.maxImagesPerConversation),
      reviewAgeingHours: String(x.settings.reviewAgeingHours), labourRatePerHour: String(x.pricingPolicy.labourRatePerHour),
      afterHoursMultiplier: String(x.pricingPolicy.afterHoursMultiplier), materialMarkupPct: String(x.pricingPolicy.materialMarkupPct),
      globalMinimum: String(x.pricingPolicy.globalMinimum), globalMaximum: String(x.pricingPolicy.globalMaximum),
    });
  });

  const submit = (path: string, body: object, done: string) =>
    save.mutate({ path, body: { ...body, changeNote: 'Updated in the app' } }, { onSuccess: () => toast.success(done), onError: (e) => toast.error(errorMessage(e)) });

  if (!d || !s || !sev || !pricing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BrandHeader section="AI Assistant" back />
        <Screen withTabBar={false}><QueryFallback query={q} /></Screen>
      </View>
    );
  }

  const field = (key: string, label: string, helper?: string) => (
    <TextField key={key} label={label} value={text[key] ?? ''} onChangeText={(v) => setText({ ...text, [key]: v })} keyboardType="decimal-pad" helper={helper} />
  );
  const settingsBody: AiSettings = {
    ...s,
    maxClarificationRounds: num(text.maxClarificationRounds ?? ''), proposalConfidenceThreshold: num(text.proposalConfidenceThreshold ?? ''),
    reviewConfidenceThreshold: num(text.reviewConfidenceThreshold ?? ''), knowledgeRetrievalCount: num(text.knowledgeRetrievalCount ?? ''),
    pricingTolerancePct: num(text.pricingTolerancePct ?? ''), maxImagesPerConversation: num(text.maxImagesPerConversation ?? ''), reviewAgeingHours: num(text.reviewAgeingHours ?? ''),
  };
  const pricingBody: PricingPolicy = {
    ...pricing,
    labourRatePerHour: num(text.labourRatePerHour ?? ''), afterHoursMultiplier: num(text.afterHoursMultiplier ?? ''), materialMarkupPct: num(text.materialMarkupPct ?? ''),
    globalMinimum: num(text.globalMinimum ?? ''), globalMaximum: num(text.globalMaximum ?? ''),
  };
  const setLevel = (i: number, patch: Partial<SeverityPolicy['levels'][number]>) => setSev({ ...sev, levels: sev.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="AI Assistant" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        <Card style={{ gap: 4 }} testID="ai-provider-status">
          <Label>AI provider</Label>
          <KeyValue label="Provider (environment)" value={d.provider.name} mono />
          <KeyValue label="Model" value={d.provider.model} mono />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <KeyValue label="API key" value={d.provider.apiKey} valueColor={d.provider.apiKey === 'Configured' ? 'success' : 'textMuted'} />
            {d.provider.simulation ? <Badge label="DEV SIMULATION" tone="secondary" /> : <Badge label={d.provider.configured ? 'LIVE' : 'HUMAN ONLY'} tone={d.provider.configured ? 'success' : 'warning'} />}
          </View>
          <KeyValue label="Server kill switch (AI_ASSISTANT_ENABLED)" value={d.provider.envEnabled ? 'On' : 'Off'} />
          <Text variant="caption" color="textMuted">Keys live in the server environment / Key Vault and are never shown or editable in the app. Prompt {d.promptVersion}.</Text>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label>Assistant · version {d.settingsVersion}</Label>
          <Checkbox checked={s.featureEnabled} onChange={(v) => setS({ ...s, featureEnabled: v })} label="Smart Quote enabled for customers" />
          <Text variant="title" weight="bold">Provider mode</Text>
          <Segmented value={s.providerMode} onChange={(v) => setS({ ...s, providerMode: v })} options={[{ value: 'ENV_DEFAULT', label: 'Use configured AI' }, { value: 'HUMAN_ONLY', label: 'Human review only' }]} />
          <TextField label="Model name override (optional)" value={s.modelName} onChangeText={(v) => setS({ ...s, modelName: v })} autoCapitalize="none" />
          {field('maxClarificationRounds', 'Max clarification rounds (0–5)')}
          {field('proposalConfidenceThreshold', 'Proposal confidence threshold (%)', 'At or above: the AI may present a preliminary proposal.')}
          {field('reviewConfidenceThreshold', 'Admin-review threshold (%)', 'Below this: no proposal, escalate to the team.')}
          <Text variant="title" weight="bold">Escalate to admin at severity</Text>
          <Segmented value={String(s.escalateSeverityAtOrAbove) as '3' | '4'} onChange={(v) => setS({ ...s, escalateSeverityAtOrAbove: Number(v) })} options={[{ value: '3', label: '3 and above' }, { value: '4', label: '4 and above' }]} />
          <Checkbox checked={s.requireAdminApprovalForAllProposals} onChange={(v) => setS({ ...s, requireAdminApprovalForAllProposals: v })} label="Require admin approval for every proposal" />
          {field('knowledgeRetrievalCount', 'Knowledge entries retrieved per case (0–10)')}
          <Checkbox checked={s.officeAdminCanApproveKnowledge} onChange={(v) => setS({ ...s, officeAdminCanApproveKnowledge: v })} label="Office admins may approve knowledge (otherwise owner only)" />
          {field('pricingTolerancePct', 'Pricing tolerance vs approved history (%)')}
          {field('maxImagesPerConversation', 'Max photos per case')}
          {field('reviewAgeingHours', 'Remind admins after (hours unresolved)')}
          <Button label="Save assistant settings" icon="save" loading={save.isPending} onPress={() => submit('/ai/settings', { settings: settingsBody }, 'Settings saved')} testID="ai-settings-save" />
        </Card>

        <Accordion title={`Severity rules & response targets · version ${d.severityPolicyVersion}`}>
          <View style={{ gap: spacing.lg }}>
            {sev.levels.map((l, i) => (
              <Card key={l.level} style={{ gap: spacing.sm }}>
                <Text variant="title" weight="bold">Severity {l.level}</Text>
                <TextField label="Name" value={l.name} onChangeText={(v) => setLevel(i, { name: v })} />
                <TextField label="Target response" value={l.targetResponse} onChangeText={(v) => setLevel(i, { targetResponse: v })} />
                <TextField label="Response window" value={l.responseWindow} onChangeText={(v) => setLevel(i, { responseWindow: v })} />
                <TextField label="Customer-facing wording" multiline value={l.customerWording} onChangeText={(v) => setLevel(i, { customerWording: v })} helper="Avoid promises — e.g. “target”, “subject to technician availability”." />
                {l.level <= 3 ? (
                  <>
                    <Checkbox checked={l.escalate} onChange={(v) => setLevel(i, { escalate: v })} label="Always escalate to admin" />
                    <Checkbox checked={l.adminApprovalRequired} onChange={(v) => setLevel(i, { adminApprovalRequired: v })} label="Admin approval required before a proposal" />
                  </>
                ) : <Text variant="caption" color="textMuted">Always escalated with mandatory admin review.</Text>}
              </Card>
            ))}
            <Label>Core safety rules (built in, cannot be removed)</Label>
            {d.coreSafetyRules.map((r) => <Text key={r.code} variant="caption" color="textSecondary">• {r.label} → severity ≥ {r.minSeverity}</Text>)}
            <Label>Additional safety rules</Label>
            {sev.additionalSafetyRules.map((r) => <Text key={r.code} variant="caption">• {r.label} ({r.keywords.join(', ')}) → ≥ {r.minSeverity}</Text>)}
            <TextField label="New rule label" value={rule.label} onChangeText={(v) => setRule({ ...rule, label: v })} />
            <TextField label="Trigger words / phrases (comma separated)" value={rule.keywords} onChangeText={(v) => setRule({ ...rule, keywords: v })} />
            <Segmented value={rule.minSeverity} onChange={(v) => setRule({ ...rule, minSeverity: v })} options={[{ value: '3', label: '≥3' }, { value: '4', label: '≥4' }, { value: '5', label: '≥5' }]} />
            <Button label="Add rule" variant="secondary" disabled={rule.label.trim().length < 3 || !rule.keywords.trim()} onPress={() => {
              const code = rule.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'CUSTOM_RULE';
              setSev({ ...sev, additionalSafetyRules: [...sev.additionalSafetyRules, { code: /^[A-Z]/.test(code) ? code : `R_${code}`, label: rule.label.trim(), keywords: rule.keywords.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 3), minSeverity: Number(rule.minSeverity) }] });
              setRule({ label: '', keywords: '', minSeverity: '5' });
            }} />
            <Button label="Save severity policy" icon="save" loading={save.isPending} onPress={() => submit('/ai/policies/severity', { policy: sev }, 'Severity policy saved')} />
          </View>
        </Accordion>

        <Accordion title={`Pricing rules · version ${d.pricingPolicyVersion}`}>
          <View style={{ gap: spacing.md }}>
            {field('labourRatePerHour', 'Labour rate (R / hour)')}
            {field('afterHoursMultiplier', 'After-hours labour multiplier')}
            {field('materialMarkupPct', 'Material markup (%)')}
            {field('globalMinimum', 'Minimum displayed estimate (R)')}
            {field('globalMaximum', 'Maximum displayed estimate (R)')}
            <Label>Categories (call-out · labour hours · floor–ceiling)</Label>
            {pricing.categories.map((c, i) => (
              <View key={c.code} style={{ gap: 4 }}>
                <Text variant="bodySmall" weight="bold">{c.label}{c.supported ? '' : ' — human review only'}</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><TextField label="Call-out" value={String(c.calloutFee)} keyboardType="decimal-pad" onChangeText={(v) => setPricing({ ...pricing, categories: pricing.categories.map((x, j) => (j === i ? { ...x, calloutFee: num(v) || 0 } : x)) })} /></View>
                  <View style={{ flex: 1 }}><TextField label="Ceiling" value={String(c.priceCeiling)} keyboardType="decimal-pad" onChangeText={(v) => setPricing({ ...pricing, categories: pricing.categories.map((x, j) => (j === i ? { ...x, priceCeiling: num(v) || 0 } : x)) })} /></View>
                </View>
                <Text variant="caption" color="textMuted">{c.labourHours.min}–{c.labourHours.max} h · floor R{c.priceFloor} · maps to {c.serviceTypeSlug ?? '— (admin chooses)'}</Text>
              </View>
            ))}
            <Button label="Save pricing policy" icon="save" loading={save.isPending} onPress={() => submit('/ai/policies/pricing', { policy: pricingBody }, 'Pricing policy saved')} />
          </View>
        </Accordion>
        <Text variant="caption" color="textMuted">Every save creates a new immutable version. Past assessments keep the versions that produced them.</Text>
      </Screen>
    </View>
  );
}
