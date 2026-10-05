/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { DiscountDto } from '@hydra/shared';
import { errorMessage } from '../../../api/client';
import { flatten, useDiscounts, useInvoices, useRedeem, useRewardTx, useRewards } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, EmptyState, Icon, Label, ProgressBar, SectionHeader, Text, colors, radius, spacing, toast } from '../../../design-system';
import { fmtDate, money, tierProgress } from '../../../utils/format';
import { QueryFallback, notReady } from '../../../components/QueryState';

export default function RewardsScreen() {
  const rewards = useRewards();
  const discounts = useDiscounts();
  const tx = useRewardTx();
  const invoices = useInvoices({ status: undefined });
  const redeem = useRedeem();
  const [picking, setPicking] = useState<DiscountDto | null>(null);
  const r = rewards.data;
  const payable = flatten(invoices.data).filter((i) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && i.amountDue > 0);

  const apply = (invoiceId: string) => {
    if (!picking) return;
    redeem.mutate(
      { discountId: picking.id, invoiceId },
      {
        onSuccess: () => {
          toast.success(`${picking.code} applied to your invoice`);
          setPicking(null);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Rewards" />
      <Screen onRefresh={() => void Promise.all([rewards.refetch(), discounts.refetch(), tx.refetch()])} refreshing={rewards.isRefetching}>
        {!r ? <QueryFallback query={rewards} count={2} /> : (
          <Card accent="secondary" style={{ gap: spacing.md, backgroundColor: '#18152A' }}>
            <View style={styles.between}>
              <Label color="secondaryBright">PSG Loyalty</Label>
              <Badge label={`${r.tier} TIER`} tone="secondary" />
            </View>
            <Text variant="stat" color="secondaryBright" style={{ fontSize: 40, lineHeight: 46 }}>{r.pointsBalance.toLocaleString('en-ZA')}</Text>
            <Text variant="bodySmall" color="textMuted">Available points · {r.lifetimePoints.toLocaleString('en-ZA')} earned lifetime</Text>
            {r.nextTier ? (
              <>
                <ProgressBar tone="secondary" value={tierProgress(r)} />
                <Text variant="caption" color="textMuted">{r.pointsToNextTier} more lifetime points to reach {r.nextTier}</Text>
              </>
            ) : <Text variant="caption" color="secondaryBright">Top tier reached — thank you!</Text>}
            <Text variant="caption" color="textSecondary">Earn 1 point for every R{r.randPerPoint} of fully paid invoices.</Text>
          </Card>
        )}

        <SectionHeader title="Available rewards" icon="gift" />
        {notReady(discounts) ? <QueryFallback query={discounts} count={2} /> : (discounts.data ?? []).length === 0 ? (
          <EmptyState icon="gift" title="No offers right now" message="New rewards are added regularly." />
        ) : (discounts.data ?? []).map((d) => (
          <Card key={d.id} accent={d.eligible ? 'secondary' : 'none'} style={{ gap: spacing.sm }}>
            <View style={styles.between}>
              <Text variant="mono" color="secondaryBright">{d.code}</Text>
              <Badge label={`${d.pointsCost} PTS`} tone={d.eligible ? 'secondary' : 'neutral'} />
            </View>
            <Text variant="title" weight="bold">{d.description}</Text>
            <Text variant="caption" color="textMuted">
              {d.discountType === 'PERCENT' ? `${d.value}% off` : `${money(d.value)} off`}{d.minSpend ? ` · invoices from ${money(d.minSpend)}` : ''} · until {fmtDate(d.validUntil)}
            </Text>
            {d.eligible ? (
              <Button label="Redeem on an invoice" icon="check" variant="violet" size="sm" onPress={() => (payable.length ? setPicking(d) : toast.info('You have no unpaid invoices to apply this reward to.'))} />
            ) : (
              <Text variant="caption" color="warning">{d.ineligibleReason}</Text>
            )}
          </Card>
        ))}

        <SectionHeader title="Points history" icon="list" />
        {flatten(tx.data).length === 0 ? <Text variant="bodySmall" color="textMuted">Points you earn and redeem will appear here.</Text> : flatten(tx.data).map((t) => (
          <View key={t.id} style={styles.tx}>
            <View style={[styles.txIcon, { backgroundColor: t.type === 'REDEEM' ? colors.dangerMuted : colors.secondaryMuted }]}>
              <Icon name={t.type === 'REDEEM' ? 'arrow-up-right' : 'arrow-down-left'} size={16} color={t.type === 'REDEEM' ? 'dangerBright' : 'secondaryBright'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodySmall" weight="semibold">{t.description}</Text>
              <Text variant="caption" color="textMuted">{fmtDate(t.createdAt)}</Text>
            </View>
            <Text variant="mono" color={t.type === 'REDEEM' ? 'dangerBright' : 'secondaryBright'}>{t.type === 'REDEEM' ? `−${t.pointsRedeemed}` : `+${t.pointsEarned}`}</Text>
          </View>
        ))}
        {tx.hasNextPage ? <Button label="Load more" variant="ghost" onPress={() => void tx.fetchNextPage()} /> : null}
      </Screen>

      <Modal visible={!!picking} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text variant="h3">Apply {picking?.code} to…</Text>
          <Text variant="caption" color="textMuted">{picking?.pointsCost} points will be deducted. This cannot be undone.</Text>
          {payable.map((i) => (
            <Pressable key={i.id} accessibilityRole="button" onPress={() => apply(i.id)} disabled={redeem.isPending} style={styles.invRow}>
              <View style={{ flex: 1 }}>
                <Text variant="mono">{i.number}</Text>
                <Text variant="caption" color="textMuted">{i.jobReference}</Text>
              </View>
              <Text variant="title" weight="bold">{money(i.amountDue)}</Text>
              <Icon name="chevron-right" color="textMuted" />
            </Pressable>
          ))}
          <Button label="Cancel" variant="secondary" onPress={() => setPicking(null)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tx: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: 6 },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  invRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
