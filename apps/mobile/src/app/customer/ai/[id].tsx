/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useAiAction, useAiConversation } from '../../../api/ai';
import { errorMessage, newIdempotencyKey } from '../../../api/client';
import { BrandHeader, Screen } from '../../../components/layout';
import { QueryFallback } from '../../../components/QueryState';
import { Badge, Button, Card, Checkbox, Label, Segmented, Text, TextField, colors, confirm, spacing, toast } from '../../../design-system';
import { AssessmentCard, MessageBubble, SafetyWarning, SimulationBanner } from '../../../features/ai/components';
import { PhotoPicker, type UploadedPhoto } from '../../../features/photos';
import { useAuth } from '../../../store/auth';

/** One Smart Quote case: conversation, assessment, proposal actions and follow-up composer. */
export default function AssessmentConversation() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useAiConversation(id);
  const action = useAiAction();
  const user = useAuth((s) => s.user);
  const c = q.data;
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [siteAddress, setSiteAddress] = useState(user?.address ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [helpful, setHelpful] = useState<'YES' | 'PARTLY' | 'NO'>('YES');
  // Keys are per logical action and are only renewed after a success, so retries replay safely.
  const keys = useRef<Record<string, string>>({});
  const keyFor = (name: string) => (keys.current[name] ??= newIdempotencyKey());
  const busy = useRef(false);

  const run = async (name: string, path: string, body: object, done?: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await action.mutateAsync({ path: `/ai/conversations/${id}/${path}`, body, key: keyFor(name) });
      delete keys.current[name];
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    const ok = await run('message', 'messages', { body: text.trim(), attachmentIds: photos.map((p) => p.id) });
    if (ok) {
      setText('');
      setPhotos([]);
    }
  };

  const accept = async () => {
    if (!confirmed || siteAddress.trim().length < 5) {
      toast.error('Add the site address and confirm you understand this is a preliminary estimate.');
      return;
    }
    if (await run('accept', 'accept', { siteAddress: siteAddress.trim(), confirm: true }, 'Proposal accepted — our team will confirm the scope.')) setAccepting(false);
  };

  const decline = async () => {
    if (await confirm({ title: 'Decline this proposal?', message: 'The assessment will be closed. You can start a new one any time.', confirmLabel: 'Decline', destructive: true })) {
      await run('decline', 'decline', {});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Smart Quote" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!c ? <QueryFallback query={q} /> : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <View style={{ flexShrink: 1 }}>
                <Text variant="mono" color="primaryBright">{c.reference}</Text>
                <Text variant="h3" numberOfLines={2}>{c.title}</Text>
              </View>
              <Badge label={c.statusLabel} tone={c.pendingReview ? 'warning' : c.status === 'CLOSED' ? 'neutral' : 'primary'} mono={false} />
            </View>
            <SimulationBanner label={c.notices.simulation} />
            {c.safetyWarning ? <SafetyWarning text={c.safetyWarning} /> : null}

            <View style={{ gap: spacing.md }} testID="ai-messages">
              {c.messages.map((m) => <MessageBubble key={m.id} m={m} />)}
            </View>

            {c.pendingReview ? (
              <Card accent="secondary" style={{ gap: 6 }} testID="ai-pending-review">
                <Text variant="title" weight="bold">With our team</Text>
                <Text variant="bodySmall" color="textMuted">A member of PSG Electrical is reviewing this request. You’ll get a notification and the reply will appear here.</Text>
              </Card>
            ) : null}

            {c.assessment ? <AssessmentCard a={c.assessment} proposal={c.proposal} disclaimer={c.notices.disclaimer} estimateNotice={c.notices.estimateNotice} /> : null}

            {c.proposal?.status === 'ACCEPTED' || c.jobId ? (
              <Card accent="success" style={{ gap: spacing.sm }} testID="ai-accepted">
                <Text variant="title" weight="bold">Proposal accepted</Text>
                <Text variant="bodySmall" color="textMuted">{c.jobReference ? `Service request ${c.jobReference} is in our queue. A formal quote follows after the team confirms the scope.` : 'Our team will create your service request and confirm the scope.'}</Text>
                {c.jobId ? <Button label="Open service request" icon="briefcase" variant="secondary" onPress={() => router.push(`/customer/job/${c.jobId}`)} /> : null}
              </Card>
            ) : null}

            {c.can.accept ? (
              accepting ? (
                <Card style={{ gap: spacing.md }} testID="ai-accept-form">
                  <Label>Accept preliminary proposal</Label>
                  <TextField label="Site address" required value={siteAddress} onChangeText={setSiteAddress} icon="map-pin" testID="ai-accept-address" />
                  <Checkbox checked={confirmed} onChange={setConfirmed} label="I understand this is a preliminary estimate, not a final quote. Final pricing follows an on-site inspection." />
                  <Button label="Confirm and accept" icon="check" loading={action.isPending} onPress={() => void accept()} testID="ai-accept-confirm" />
                  <Button label="Cancel" variant="ghost" onPress={() => setAccepting(false)} />
                </Card>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <Button label="Accept proposal" icon="check-circle" onPress={() => setAccepting(true)} testID="ai-accept" haptic />
                  {c.can.requestReview ? <Button label="Request admin review" icon="users" variant="violet" onPress={() => void run('review', 'request-review', {}, 'Sent to our team')} testID="ai-request-review" /> : null}
                  <Button label="Add more information" icon="edit-3" variant="secondary" onPress={() => toast.success('Type below and add photos, then send.')} testID="ai-add-info" />
                  <Button label="Decline" icon="x" variant="dangerOutline" onPress={() => void decline()} testID="ai-decline" />
                </View>
              )
            ) : c.can.requestReview ? (
              <Button label="Talk to a person instead" icon="users" variant="violet" onPress={() => void run('review', 'request-review', {}, 'Sent to our team')} testID="ai-request-review" />
            ) : null}

            {c.can.sendMessage ? (
              <Card style={{ gap: spacing.md }} testID="ai-composer">
                <TextField label={c.status === 'NEEDS_INFORMATION' ? 'Your answer' : 'Add more information'} multiline value={text} onChangeText={setText} placeholder="Type your reply…" maxLength={2000} testID="ai-reply" />
                <PhotoPicker value={photos} onChange={setPhotos} purpose="AI_ASSESSMENT_PHOTO" max={4} label="Add photos" />
                <Button label="Send" icon="send" loading={action.isPending} disabled={!text.trim()} onPress={() => void send()} testID="ai-send" />
              </Card>
            ) : null}

            {c.can.giveFeedback ? (
              <Card style={{ gap: spacing.md }} testID="ai-feedback">
                <Text variant="title" weight="bold">Was the AI assessment helpful?</Text>
                <Segmented value={helpful} onChange={setHelpful} options={[{ value: 'YES', label: 'Yes' }, { value: 'PARTLY', label: 'Partly' }, { value: 'NO', label: 'No' }]} />
                <Button label={c.customerFeedback ? 'Update feedback' : 'Send feedback'} variant="secondary" onPress={() => void run('feedback', 'feedback', { helpful }, 'Thanks for the feedback')} />
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
