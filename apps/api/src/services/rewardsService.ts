/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import {
  REWARD_TIERS,
  discountValue,
  formatZar,
  roundMoney,
  type DiscountDto,
  type DiscountInput,
  type RewardsSummaryDto,
} from '@hydra/shared';
import { db } from '../db/pool';
import { PostgresBillingRepository } from '../repositories/billingRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresRewardsRepository } from '../repositories/rewardsRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import type { AuthContext } from '../types/express';
import { todayIso } from '../utils/dates';
import { businessRule, forbidden, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { audit, type Actor } from './auditService';
import { transactional } from './events';
import { transitionJob } from './jobLifecycle';

const TIER_THRESHOLDS: Record<string, number> = { BRONZE: 0, SILVER: 1500, GOLD: 5000, PLATINUM: 10000 };

function customerId(auth: AuthContext): string {
  if (auth.role !== 'CUSTOMER' || !auth.customerId) throw forbidden('Rewards are available to customer accounts');
  return auth.customerId;
}

export async function rewardsSummary(auth: AuthContext): Promise<RewardsSummaryDto> {
  const account = await new PostgresRewardsRepository(db()).account(customerId(auth));
  if (!account) throw notFound('Rewards account');
  const settings = await new PostgresSettingsRepository(db()).getAll();
  const idx = REWARD_TIERS.indexOf(account.tier);
  const nextTier = REWARD_TIERS[idx + 1] ?? null;
  return {
    accountId: account.id,
    pointsBalance: account.pointsBalance,
    lifetimePoints: account.lifetimePoints,
    tier: account.tier,
    nextTier,
    pointsToNextTier: nextTier ? Math.max(0, TIER_THRESHOLDS[nextTier]! - account.lifetimePoints) : null,
    randPerPoint: settings.rewardsRandPerPoint,
  };
}

export async function rewardTransactions(auth: AuthContext, page: number, pageSize: number) {
  const repo = new PostgresRewardsRepository(db());
  const account = await repo.account(customerId(auth));
  if (!account) throw notFound('Rewards account');
  const { items, total } = await repo.transactions(account.id, pageSize, (page - 1) * pageSize);
  return paginated(items, page, pageSize, total);
}

function ineligibility(d: DiscountDto, balance: number): string | null {
  const today = todayIso();
  if (!d.active) return 'Offer is inactive';
  if (today < d.validFrom || today > d.validUntil) return 'Offer is outside its validity period';
  if (d.maxRedemptions !== null && d.redemptionCount >= d.maxRedemptions) return 'Offer is fully redeemed';
  if (balance < d.pointsCost) return `Needs ${d.pointsCost - balance} more points`;
  return null;
}

/** Customer view: active offers with eligibility (PDF Fig. 11 EligibilityCheck). */
export async function availableDiscounts(auth: AuthContext) {
  const repo = new PostgresRewardsRepository(db());
  const account = await repo.account(customerId(auth));
  const { items } = await repo.listDiscounts({ activeOnly: true, limit: 100, offset: 0 });
  return items.map((d) => {
    const reason = ineligibility(d, account?.pointsBalance ?? 0);
    return { ...d, eligible: reason === null, ineligibleReason: reason };
  });
}

/**
 * Redemption (PDF Story 14): eligibility check, points debit, CUSTOMER_DISCOUNT row and invoice
 * reduction all commit together or not at all.
 */
export async function redeemDiscount(auth: AuthContext, discountId: string, invoiceId: string, actor: Actor) {
  const cid = customerId(auth);
  await transactional(async (tx, events) => {
    const rewards = new PostgresRewardsRepository(tx);
    const billing = new PostgresBillingRepository(tx);
    const discount = await rewards.findDiscount(discountId, true);
    if (!discount) throw notFound('Discount');
    const inv = await billing.findInvoice(invoiceId, true);
    if (!inv || inv.customerId !== cid || inv.status === 'DRAFT') throw notFound('Invoice');
    if (!['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status) || inv.amountDue <= 0) {
      throw businessRule('Discounts can only be applied to an invoice with an outstanding balance', 'INVOICE_NOT_ELIGIBLE');
    }
    const account = await rewards.account(cid, true);
    if (!account) throw notFound('Rewards account');
    const reason = ineligibility(discount, account.pointsBalance);
    if (reason) throw businessRule(reason, 'DISCOUNT_NOT_ELIGIBLE');
    if (inv.total < discount.minSpend) throw businessRule(`This offer requires a minimum invoice of ${formatZar(discount.minSpend)}`, 'DISCOUNT_NOT_ELIGIBLE');
    if (await rewards.discountAppliedToInvoice(discountId, invoiceId)) throw businessRule('This offer is already applied to the invoice', 'DISCOUNT_ALREADY_APPLIED');
    const value = discountValue(discount.discountType, discount.value, inv.amountDue);
    if (value <= 0) throw businessRule('This offer has no value for the selected invoice', 'DISCOUNT_NOT_ELIGIBLE');
    await rewards.applyDiscount({ discountId, customerId: cid, invoiceId, amount: value, points: discount.pointsCost });
    await billing.addDiscountToInvoice(invoiceId, value);
    if (discount.pointsCost > 0) {
      await rewards.debit(account.id, discount.pointsCost, { jobId: inv.jobId, invoiceId, description: `Redeemed ${discount.code} on ${inv.number}` });
    }
    const remaining = roundMoney(inv.amountDue - value);
    if (remaining <= 0) {
      await billing.setInvoiceStatus(invoiceId, 'PAID', { paid: true });
      const job = await new PostgresJobRepository(tx).findById(inv.jobId, true);
      if (job && ['INVOICED', 'PARTIALLY_PAID'].includes(job.status)) await transitionJob(tx, events, job, 'FULL_PAYMENT', actor, { note: `Settled by ${discount.code}` });
    }
    events.emit(`user:${auth.userId}`, 'invoice.updated', { invoiceId });
    await audit(tx, actor, 'DISCOUNT_REDEEMED', 'invoice', invoiceId, { discountId, code: discount.code, amount: value, points: discount.pointsCost });
  });
  return { invoiceId, summary: await rewardsSummary(auth) };
}

export async function listDiscountsAdmin(page: number, pageSize: number) {
  const { items, total } = await new PostgresRewardsRepository(db()).listDiscounts({ activeOnly: false, limit: pageSize, offset: (page - 1) * pageSize });
  return paginated(items, page, pageSize, total);
}

export async function createDiscount(auth: AuthContext, input: DiscountInput, actor: Actor) {
  const id = await transactional(async (tx) => {
    const newId = await new PostgresRewardsRepository(tx).createDiscount(input, auth.userId);
    await audit(tx, actor, 'DISCOUNT_CREATED', 'discount', newId, { code: input.code, value: input.value, type: input.discountType });
    return newId;
  });
  return (await new PostgresRewardsRepository(db()).findDiscount(id))!;
}

export async function updateDiscount(id: string, input: Partial<DiscountInput>, actor: Actor) {
  await transactional(async (tx) => {
    if (!(await new PostgresRewardsRepository(tx).updateDiscount(id, input))) throw notFound('Discount');
    await audit(tx, actor, 'DISCOUNT_UPDATED', 'discount', id, { fields: Object.keys(input) });
  });
  return (await new PostgresRewardsRepository(db()).findDiscount(id))!;
}
