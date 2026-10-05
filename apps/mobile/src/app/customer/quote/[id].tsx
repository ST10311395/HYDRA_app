import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { errorMessage } from '../../../api/client';
import { useQuote, useQuoteResponse } from '../../../api/queries';
import { QuoteBreakdown } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Label, Text, TextField, colors, confirm, spacing, toast } from '../../../design-system';
import { money } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

/** Quote review (PDF Story 6): labour and materials shown separately; accept/decline is a server transaction. */
export default function QuoteReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuote(id);
  const respond = useQuoteResponse();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const quote = q.data;
  const open = quote?.status === 'SENT';

  const accept = async () => {
    if (!quote) return;
    if (!(await confirm({ title: `Accept quote for ${money(quote.total)}?`, message: 'We will schedule a certified electrician and notify you of the date and time.', confirmLabel: 'Accept quote' }))) return;
    respond.mutate({ id, decision: 'accept' }, {
      onSuccess: () => {
        toast.success('Quote accepted — scheduling your electrician.');
        router.replace(`/customer/job/${quote.jobId}`);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Quotation" back />
      <Screen withTabBar={false}
        footer={open && !declining ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => setDeclining(true)} />
            <Button label="Accept quote" icon="check" style={{ flex: 1.5 }} loading={respond.isPending} onPress={() => void accept()} haptic testID="quote-accept" />
          </View>
        ) : undefined}>
        {!quote ? <QueryFallback query={q} count={2} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="mono" color="primaryBright">{quote.jobReference} · v{quote.version}</Text>
                <Badge label={quote.status} tone={quote.status === 'ACCEPTED' ? 'success' : quote.status === 'SENT' ? 'warning' : 'neutral'} />
              </View>
              <Text variant="h1">{money(quote.total)}</Text>
              <Text variant="caption" color="textMuted">Including VAT · engineer-reviewed quotation</Text>
            </Card>
            <Card style={{ gap: spacing.md }}>
              <Label>Breakdown</Label>
              <QuoteBreakdown quote={quote} />
            </Card>
            {quote.terms ? (
              <Card style={{ gap: 6 }}>
                <Label>Terms</Label>
                <Text variant="bodySmall" color="textSecondary">{quote.terms}</Text>
              </Card>
            ) : null}
            {quote.notes ? (
              <Card style={{ gap: 6 }}>
                <Label>Notes from the office</Label>
                <Text variant="bodySmall" color="textSecondary">{quote.notes}</Text>
              </Card>
            ) : null}
            {quote.declineReason ? <Text variant="bodySmall" color="textMuted">You declined: {quote.declineReason}</Text> : null}
            {declining ? (
              <Card accent="danger" style={{ gap: spacing.md }}>
                <Text variant="title" weight="bold">Decline this quote?</Text>
                <TextField label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="Help us improve — e.g. price, timing…" />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setDeclining(false)} />
                  <Button label="Decline quote" variant="danger" style={{ flex: 1 }} loading={respond.isPending} onPress={() => respond.mutate({ id, decision: 'decline', reason: reason || undefined }, {
                    onSuccess: () => { toast.info('Quote declined. You can request a revised quote or another service.'); setDeclining(false); },
                    onError: (e) => toast.error(errorMessage(e)),
                  })} />
                </View>
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
