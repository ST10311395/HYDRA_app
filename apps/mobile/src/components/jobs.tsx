/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { InvoiceDto, JobDetailDto, JobSummaryDto, MilestoneDto, QuoteDto } from '@hydra/shared';
import { api, errorMessage } from '../api/client';
import { useJobAction } from '../api/queries';
import { Badge, Button, Card, Divider, Icon, KeyValue, Label, SelectField, Text, TextField, colors, radius, spacing, toast } from '../design-system';
import { SERVICE_ICON, fmtDate, fmtDateTime, fmtRelative, jobStatusLabel, jobStatusTone, money } from '../utils/format';
import { callNumber } from '../utils/links';

export function JobStatusBadge({ status }: { status: JobSummaryDto['status'] }) {
  return <Badge label={jobStatusLabel(status).toUpperCase()} tone={jobStatusTone(status)} />;
}

/** Summary card for job lists (customer, electrician and admin views). */
export function JobCard({ job, onPress, showCustomer, showElectrician = true }: { job: JobSummaryDto; onPress: () => void; showCustomer?: boolean; showElectrician?: boolean }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`Job ${job.reference}, ${jobStatusLabel(job.status)}`} testID={`job-${job.reference}`} style={{ gap: spacing.sm }}>
      <View style={styles.between}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {job.urgency === 'EMERGENCY' ? <Icon name="alert-octagon" size={15} color="dangerBright" /> : null}
          <Text variant="mono" color="primaryBright">{job.reference}</Text>
        </View>
        <JobStatusBadge status={job.status} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name={SERVICE_ICON[job.serviceType.category] ?? 'zap'} size={16} color="textSecondary" />
        <Text variant="title" weight="bold" style={{ flex: 1 }} numberOfLines={2}>{job.serviceType.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="map-pin" size={14} color="textMuted" />
        <Text variant="bodySmall" color="textMuted" numberOfLines={2} style={{ flex: 1 }}>{job.siteAddress}</Text>
      </View>
      {showCustomer ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="user" size={14} color="textMuted" />
          <Text variant="bodySmall" color="textMuted">{job.customer.name}</Text>
        </View>
      ) : null}
      <View style={[styles.between, { marginTop: 2 }]}>
        <Text variant="caption" color="textSecondary">
          {job.scheduledStart ? `🗓 ${fmtDateTime(job.scheduledStart)}` : `Requested ${fmtRelative(job.createdAt)}`}
        </Text>
        {showElectrician && job.electrician ? <Text variant="caption" color="textMuted">⚡ {job.electrician.name}</Text> : null}
      </View>
      {job.nextMilestone && !['PAID', 'CANCELLED'].includes(job.status) ? (
        <View style={styles.next}>
          <Label color="textMuted">Next</Label>
          <Text variant="caption" weight="semibold">{job.nextMilestone}</Text>
        </View>
      ) : null}
    </Card>
  );
}

/** Server-driven live milestone timeline (spec §8.4, PDF Story 5). */
/**
 * Server-driven milestone timeline. Steps are only ever marked done by the server as the job's
 * status advances; a cancelled job has no next step, and a declined quote shows the quote step as
 * declined (the office re-quotes) instead of "next".
 */
export function Timeline({ milestones, cancelled, status }: { milestones: MilestoneDto[]; cancelled?: boolean; status?: JobSummaryDto['status'] }) {
  const halted = cancelled || status === 'CANCELLED';
  const declined = status === 'QUOTE_DECLINED';
  const nextIndex = halted || declined ? -1 : milestones.findIndex((m) => m.status === 'PENDING');
  return (
    <View accessibilityRole="list">
      {milestones.map((m, i) => {
        const done = m.status === 'COMPLETED';
        const current = i === nextIndex;
        const declinedStep = declined && m.code === 'QUOTE_ACCEPTED';
        const last = i === milestones.length - 1;
        return (
          <View key={m.id} style={{ flexDirection: 'row', gap: spacing.md }} accessible accessibilityLabel={`${m.name}: ${done ? 'completed' : declinedStep ? 'declined' : current ? 'next' : 'pending'}`}>
            <View style={{ alignItems: 'center', width: 22 }}>
              <View style={[styles.dot, done ? styles.dotDone : current ? styles.dotCurrent : null]}>
                {done ? <Icon name="check" size={12} color="white" /> : null}
              </View>
              {!last ? <View style={[styles.line, done ? { backgroundColor: colors.primary } : null]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.lg, gap: 2 }}>
              <View style={styles.between}>
                <Text variant="title" weight={done || current ? 'bold' : 'medium'} color={done ? 'text' : current ? 'primaryBright' : 'textMuted'}>{m.name}</Text>
                {done && m.completedAt ? <Text variant="caption" color="textMuted">{fmtDateTime(m.completedAt)}</Text> : declinedStep ? <Badge label="DECLINED" tone="danger" /> : current ? <Badge label="NEXT" tone="primary" /> : null}
              </View>
              {m.description ? <Text variant="caption" color="textMuted">{m.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function QuoteBreakdown({ quote }: { quote: QuoteDto }) {
  return (
    <View style={{ gap: 6 }}>
      {quote.items.map((i) => (
        <View key={i.id} style={styles.line2}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall">{i.description}</Text>
            <Text variant="caption" color="textMuted">{i.kind.toLowerCase()} · {i.quantity} × {money(i.unitPrice)}</Text>
          </View>
          <Text variant="mono">{money(i.lineTotal)}</Text>
        </View>
      ))}
      <Divider style={{ marginVertical: 6 }} />
      <KeyValue label="Labour" value={money(quote.labourCost)} mono />
      <KeyValue label="Estimated materials" value={money(quote.materialsCost)} mono />
      {quote.fees ? <KeyValue label="Fees" value={money(quote.fees)} mono /> : null}
      {quote.discountAmount ? <KeyValue label="Discount" value={`− ${money(quote.discountAmount)}`} valueColor="success" mono /> : null}
      <KeyValue label={`VAT (${Math.round(quote.vatRate * 100)}%)`} value={money(quote.vatAmount)} mono />
      <View style={[styles.between, styles.total]}>
        <Text variant="title" weight="bold">Total</Text>
        <Text variant="h2" color="primaryBright">{money(quote.total)}</Text>
      </View>
      <Text variant="caption" color="textMuted">Valid until {fmtDate(quote.validUntil)}</Text>
    </View>
  );
}

export function InvoiceBreakdown({ invoice }: { invoice: InvoiceDto }) {
  return (
    <View style={{ gap: 6 }}>
      {invoice.items.map((i) => (
        <View key={i.id} style={styles.line2}>
          <Text variant="bodySmall" style={{ flex: 1 }}>{i.description}{i.quantity !== 1 ? ` × ${i.quantity}` : ''}</Text>
          <Text variant="mono">{money(i.lineTotal)}</Text>
        </View>
      ))}
      <Divider style={{ marginVertical: 6 }} />
      <KeyValue label="Subtotal" value={money(invoice.subtotal + invoice.materialsAdjustment)} mono />
      <KeyValue label="VAT" value={money(invoice.vatAmount)} mono />
      <KeyValue label="Invoice total" value={money(invoice.total)} mono />
      {invoice.discounts.map((d) => <KeyValue key={d.code} label={`Reward: ${d.code}`} value={`− ${money(d.amountApplied)}`} valueColor="success" mono />)}
      {invoice.amountPaid ? <KeyValue label="Paid" value={`− ${money(invoice.amountPaid)}`} valueColor="success" mono /> : null}
      <View style={[styles.between, styles.total]}>
        <Text variant="title" weight="bold">Amount due</Text>
        <Text variant="h2" color={invoice.amountDue > 0 ? 'warning' : 'success'}>{money(invoice.amountDue)}</Text>
      </View>
    </View>
  );
}

export function PersonRow({ icon, title, name, phone }: { icon: 'user' | 'zap'; title: string; name: string; phone: string | null }) {
  return (
    <View style={[styles.between, { gap: spacing.md }]}>
      <View style={styles.avatar}><Icon name={icon} size={18} color="primaryBright" /></View>
      <View style={{ flex: 1 }}>
        <Label>{title}</Label>
        <Text variant="title" weight="bold">{name}</Text>
      </View>
      {phone ? <Button label="Call" icon="phone" size="sm" variant="secondary" fullWidth={false} onPress={() => void callNumber(phone)} /> : null}
    </View>
  );
}

/** Notes / messages thread with composer. Staff can choose visibility; customers always post visible notes. */
export function NotesSection({ job, canPost, staff }: { job: JobDetailDto; canPost: boolean; staff: boolean }) {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'INTERNAL' | 'CUSTOMER'>('CUSTOMER');
  const post = useJobAction((v: { body: string; visibility: string }) => api.post<JobDetailDto>(`/jobs/${job.id}/notes`, v));
  return (
    <Card style={{ gap: spacing.md }}>
      <Label>Notes & messages</Label>
      {job.notes.length === 0 ? <Text variant="bodySmall" color="textMuted">No notes yet.</Text> : null}
      {job.notes.map((n) => (
        <View key={n.id} style={[styles.note, n.visibility === 'INTERNAL' ? { borderColor: colors.secondaryBorder } : null]}>
          <View style={styles.between}>
            <Text variant="caption" weight="bold">{n.authorName}</Text>
            <Text variant="caption" color="textMuted">{fmtRelative(n.createdAt)}</Text>
          </View>
          <Text variant="bodySmall" color="textSecondary">{n.body}</Text>
          {staff && n.visibility === 'INTERNAL' ? <Text variant="caption" color="secondaryBright">Internal — hidden from customer</Text> : null}
        </View>
      ))}
      {canPost ? (
        <View style={{ gap: spacing.sm }}>
          <TextField placeholder={staff ? 'Add a job note…' : 'Send a message about this job…'} value={body} onChangeText={setBody} multiline maxLength={2000} />
          {staff ? (
            <SelectField value={visibility} onChange={setVisibility} options={[{ value: 'CUSTOMER', label: 'Visible to customer' }, { value: 'INTERNAL', label: 'Internal (staff only)' }]} />
          ) : null}
          <Button
            label="Post"
            icon="send"
            size="sm"
            disabled={body.trim().length === 0}
            loading={post.isPending}
            onPress={() =>
              post.mutate(
                { body: body.trim(), visibility },
                { onSuccess: () => setBody(''), onError: (e) => toast.error(errorMessage(e)) },
              )
            }
          />
        </View>
      ) : null}
    </Card>
  );
}

export function SegmentLink({ icon, label, onPress, badge }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onPress: () => void; badge?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label} onPress={onPress} style={({ pressed }) => [styles.link, pressed ? { opacity: 0.8 } : null]}>
      <Icon name={icon} size={18} color="primaryBright" />
      <Text variant="title" style={{ flex: 1 }}>{label}</Text>
      {badge ? <Badge label={badge} tone="danger" /> : null}
      <Icon name="chevron-right" size={18} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  next: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.surfaceInset, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCurrent: { borderColor: colors.primaryBright, backgroundColor: colors.primaryMuted },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  line2: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  total: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, marginTop: 4 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  note: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 4, backgroundColor: colors.surfaceInset },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
