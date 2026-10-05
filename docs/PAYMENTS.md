# Payments setup (Paystack, ZAR)

HYDRA takes payments through a PCI-DSS compliant hosted checkout; no card data ever reaches HYDRA.
Implementation: `apps/api/src/integrations/payments.ts` (`PaystackGateway`), `services/billingService.ts`.

## Flow

1. Customer taps **Pay now** (full balance or a part-payment ≥ R1) → `POST /invoices/:id/payments` with an
   `Idempotency-Key`. The API creates a `PENDING` payment and calls Paystack
   `POST /transaction/initialize` (amount in cents, currency ZAR, reference `HYD-…`, channels card/EFT/bank transfer).
2. The app opens the returned `authorization_url` in an in-app auth session; Paystack redirects to
   `PAYMENT_CALLBACK_URL` (`hydra://payments/complete`) which closes the browser and returns to billing.
3. Paystack sends `charge.success` / `charge.failed` to `POST /api/v1/payments/webhook/paystack`. The API
   verifies `x-paystack-signature` (HMAC-SHA512 of the raw body with the secret key, constant-time compare),
   stores the event id once (duplicates ignored), and in one transaction updates the payment, the invoice
   (`PARTIALLY_PAID` or `PAID` — a partial payment never marks it paid), the job status and, when fully paid,
   credits reward points exactly once.
4. The app polls `GET /payments/:id` every 3 s while pending and refreshes the invoice when it settles.

Office staff can record EFT/cash received outside the gateway (**Invoice → Record offline payment**); this
is audited and uses the same settlement logic.

## Configure

1. Create a Paystack business account (South Africa) and complete KYC for live mode.
2. **Settings → API Keys & Webhooks**:
   - Copy the **test** secret/public keys first (`sk_test_…`, `pk_test_…`).
   - Webhook URL: `https://<api-host>/api/v1/payments/webhook/paystack` (staging and production separately).
   - Callback URL can be left blank (HYDRA sends `callback_url` per transaction).
3. API settings:

```
PAYMENT_PROVIDER=paystack
PAYMENT_SECRET_KEY=sk_test_…        # Key Vault in Azure; also used to verify webhook signatures
PAYMENT_PUBLIC_KEY=pk_test_…
PAYMENT_CALLBACK_URL=hydra://payments/complete
PAYMENT_CURRENCY=ZAR
```

4. Test with Paystack's test cards (e.g. success and decline cards in the Paystack docs) on staging; confirm
   the invoice moves to PAID, reward points are credited and the webhook appears once in `payment_webhook_events`.
5. Switch to `sk_live_…` / `pk_live_…` in production and make a small live payment.

Local development without Paystack: `PAYMENT_PROVIDER=simulated`. The checkout opens a local sandbox page
(`/api/v1/payments/sandbox/checkout/:reference`) whose buttons post an HMAC-signed webhook through the same
verification and settlement code. The sandbox routes are not mounted, and the simulated provider is refused
at startup, when `NODE_ENV=production`.

## Operational notes

- Refunds and chargebacks are handled in the Paystack dashboard; record the outcome on the invoice notes and,
  if needed, issue a credit via a corrective invoice (invoices are never edited after sending).
- Webhook retries from Paystack are safe (idempotent event table).
- If the gateway is unavailable the API returns `503 PAYMENT_GATEWAY_UNAVAILABLE`; nothing is charged.
