import type { Request, Router } from 'express';
import { z } from 'zod';
import {
  createPaymentSchema,
  discountSchema,
  formatZar,
  idParam,
  invoiceListQuery,
  paginationQuery,
  recordManualPaymentSchema,
  redeemDiscountSchema,
} from '@hydra/shared';
import { config } from '../config/env';
import { integrations } from '../integrations';
import { SimulatedGateway } from '../integrations/payments';
import { actorFrom, auth } from '../middleware/auth';
import { defineRoute } from '../routes/define';
import * as billing from '../services/billingService';
import { invoicePdf } from '../services/invoicePdfService';
import * as rewards from '../services/rewardsService';
import { badRequest, notFound } from '../utils/errors';

const ADMIN = ['ADMIN_OFFICE', 'ADMIN_OWNER'] as const;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function sandboxPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>
body{margin:0;background:#0B0F16;color:#F5F7FA;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{background:#151A22;border:1px solid #2A3340;border-radius:14px;padding:28px;max-width:420px;width:90%}
.tag{display:inline-block;border:1px solid #B13CFF;color:#D08BFF;font:12px monospace;padding:3px 8px;border-radius:999px;letter-spacing:.08em}
h1{font-size:22px;margin:14px 0 6px}p{color:#9AA5B1;line-height:1.5}.amt{font-size:32px;font-weight:800;color:#3D7BFF;margin:12px 0}
button,a.btn{display:block;width:100%;box-sizing:border-box;text-align:center;border:0;border-radius:10px;padding:14px;margin-top:10px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none}
.pay{background:#2F6BFF;color:#fff}.fail{background:transparent;color:#FF6B7D;border:1px solid #E31837}
</style></head><body><div class="card"><span class="tag">SANDBOX · NOT A REAL PAYMENT</span>${body}</div></body></html>`;
}

export function registerFinanceRoutes(r: Router): void {
  defineRoute(r, { method: 'get', path: '/invoices', tag: 'Billing', summary: 'List invoices (customer → own)', access: ['CUSTOMER', ...ADMIN], query: invoiceListQuery },
    (req, { query }) => billing.listInvoices(auth(req), query));

  defineRoute(r, { method: 'get', path: '/invoices/:id', tag: 'Billing', summary: 'Invoice with line items, payments and discounts', access: ['CUSTOMER', ...ADMIN], params: idParam },
    (req, { params }) => billing.getInvoice(auth(req), params.id));

  defineRoute(r, { method: 'get', path: '/invoices/:id/pdf', tag: 'Billing', summary: 'Download the invoice as a PDF (customer → own)', access: ['CUSTOMER', ...ADMIN], params: idParam, raw: true },
    async (req, { params }, res) => {
      const file = await invoicePdf(auth(req), params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(file.body);
    });

  defineRoute(r, { method: 'post', path: '/invoices/:id/send', tag: 'Billing', summary: 'Send a draft invoice', access: ADMIN, params: idParam },
    (req, { params }) => billing.sendInvoice(auth(req), params.id, actorFrom(req)));

  defineRoute(r, { method: 'delete', path: '/invoices/:id', tag: 'Billing', summary: 'Delete a draft (never sent) invoice', access: ADMIN, params: idParam },
    (req, { params }) => billing.deleteDraftInvoice(params.id, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/invoices/:id/payments', tag: 'Payments', summary: 'Start a (partial) payment — returns gateway checkout URL. Send Idempotency-Key header.', access: ['CUSTOMER'], params: idParam, body: createPaymentSchema, status: 201 },
    (req: Request, { params, body }) => {
      const key = req.header('idempotency-key');
      if (key && !/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw badRequest('Invalid Idempotency-Key header');
      return billing.startPayment(auth(req), params.id, body.amount, key, actorFrom(req));
    });

  defineRoute(r, { method: 'post', path: '/invoices/:id/manual-payments', tag: 'Payments', summary: 'Admin records an EFT/cash payment (audited)', access: ADMIN, params: idParam, body: recordManualPaymentSchema, status: 201 },
    (req, { params, body }) => billing.recordManualPayment(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/payments', tag: 'Payments', summary: 'Payment history', access: ['CUSTOMER', ...ADMIN], query: paginationQuery },
    (req, { query }) => billing.listPayments(auth(req), query.page, query.pageSize));

  defineRoute(r, { method: 'get', path: '/payments/:id', tag: 'Payments', summary: 'Payment status (poll after checkout)', access: ['CUSTOMER', ...ADMIN], params: idParam },
    (req, { params }) => billing.paymentStatus(auth(req), params.id));

  defineRoute(r, { method: 'post', path: '/payments/webhook/:provider', tag: 'Payments', summary: 'Payment gateway webhook (signature-verified, idempotent)', access: 'public',
    params: z.object({ provider: z.enum(['paystack', 'simulated']) }) },
    (req, { params }) => {
      if (!req.rawBody) throw badRequest('Missing body');
      return billing.handlePaymentWebhook(params.provider, req.rawBody, req.headers);
    });

  if (!config().isProduction) {
    // Development sandbox checkout — never mounted in production (config also refuses the simulated gateway there).
    defineRoute(r, { method: 'get', path: '/payments/sandbox/checkout/:reference', tag: 'Payments', summary: 'DEV ONLY sandbox checkout page', access: 'public', raw: true,
      params: z.object({ reference: z.string().regex(/^HYD-[A-Za-z0-9]{8,20}$/) }) },
      async (_req, { params }, res) => {
        const p = await billing.sandboxPayment(params.reference);
        if (!p) throw notFound('Payment');
        const action = `/api/v1/payments/sandbox/checkout/${params.reference}/complete`;
        res.setHeader('Content-Security-Policy', SANDBOX_CSP);
        res.type('html').send(sandboxPage('HYDRA sandbox checkout', p.status !== 'PENDING'
          ? `<h1>Payment ${escapeHtml(p.status.toLowerCase())}</h1><p>You can return to the HYDRA app.</p><a class="btn pay" href="${escapeHtml(config().PAYMENT_CALLBACK_URL)}">Return to app</a>`
          : `<h1>Invoice ${escapeHtml(p.invoiceNumber)}</h1><div class="amt">${escapeHtml(formatZar(p.amount))}</div>
             <p>This development checkout exercises the real signed-webhook settlement pipeline. No card details are collected.</p>
             <form method="post" action="${action}"><input type="hidden" name="outcome" value="success"><button class="pay">Simulate successful payment</button></form>
             <form method="post" action="${action}"><input type="hidden" name="outcome" value="failed"><button class="fail">Simulate declined payment</button></form>`));
      });

    defineRoute(r, { method: 'post', path: '/payments/sandbox/checkout/:reference/complete', tag: 'Payments', summary: 'DEV ONLY sandbox outcome → signed webhook', access: 'public', raw: true,
      params: z.object({ reference: z.string().regex(/^HYD-[A-Za-z0-9]{8,20}$/) }), body: z.object({ outcome: z.enum(['success', 'failed']) }) },
      async (_req, { params, body }, res) => {
        const gateway = integrations().payments;
        const p = await billing.sandboxPayment(params.reference);
        if (!(gateway instanceof SimulatedGateway) || !p) throw notFound('Payment');
        const payload = JSON.stringify({
          id: `sandbox:${params.reference}:${body.outcome}`,
          type: body.outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
          reference: params.reference,
          amount: p.amount,
          currency: p.currency,
          reason: body.outcome === 'failed' ? 'Card declined (sandbox)' : undefined,
        });
        const result = await billing.handlePaymentWebhook('simulated', Buffer.from(payload), { 'x-hydra-signature': gateway.sign(payload) });
        const ok = body.outcome === 'success' && result.result === 'SETTLED';
        res.setHeader('Content-Security-Policy', SANDBOX_CSP);
        res.type('html').send(sandboxPage('Payment result', `<h1>${ok ? 'Payment successful' : 'Payment declined'}</h1>
          <p>${ok ? 'The invoice has been updated.' : 'No money was taken.'} Return to the HYDRA app to continue.</p>
          <a class="btn pay" href="${escapeHtml(config().PAYMENT_CALLBACK_URL)}">Return to app</a>`));
      });
  }

  // Rewards & discounts
  defineRoute(r, { method: 'get', path: '/rewards', tag: 'Rewards', summary: 'My rewards balance and tier', access: ['CUSTOMER'] },
    (req) => rewards.rewardsSummary(auth(req)));

  defineRoute(r, { method: 'get', path: '/rewards/transactions', tag: 'Rewards', summary: 'Points history', access: ['CUSTOMER'], query: paginationQuery },
    (req, { query }) => rewards.rewardTransactions(auth(req), query.page, query.pageSize));

  defineRoute(r, { method: 'get', path: '/discounts', tag: 'Rewards', summary: 'Customer: available offers with eligibility · Admin: all discounts', access: ['CUSTOMER', ...ADMIN], query: paginationQuery },
    (req, { query }) => (auth(req).role === 'CUSTOMER' ? rewards.availableDiscounts(auth(req)) : rewards.listDiscountsAdmin(query.page, query.pageSize)));

  defineRoute(r, { method: 'post', path: '/discounts', tag: 'Rewards', summary: 'Create a discount offer', access: ADMIN, body: discountSchema, status: 201 },
    (req, { body }) => rewards.createDiscount(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'patch', path: '/discounts/:id', tag: 'Rewards', summary: 'Update a discount offer', access: ADMIN, params: idParam,
    body: z.object({ description: z.string().trim().min(3).max(300).optional(), active: z.boolean().optional(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), maxRedemptions: z.number().int().min(1).optional() }) },
    (req, { params, body }) => rewards.updateDiscount(params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/discounts/:id/redeem', tag: 'Rewards', summary: 'Redeem an offer against an eligible invoice (atomic)', access: ['CUSTOMER'], params: idParam, body: redeemDiscountSchema },
    (req, { params, body }) => rewards.redeemDiscount(auth(req), params.id, body.invoiceId, actorFrom(req)));
}
