# Deployment — staging and production

Infrastructure is created once with [AZURE_SETUP.md](AZURE_SETUP.md). Mobile binaries are covered in
[EAS_BUILD.md](EAS_BUILD.md). This page is the repeatable release procedure.

## Environments

| Environment | API | Database | Mobile build profile | Deploys |
| --- | --- | --- | --- | --- |
| Local | `npm run api` (http://localhost:4000) | embedded PostgreSQL :5433 | `development` (dev client) | — |
| Staging | `app-hydra-api-stg` (`https://staging-api.hydra.psgelectrical.co.za`) | `psql-hydra-stg` | `preview` | Manual workflow run, no reviewer |
| Production | `hydra-psg-api` (`https://hydra-psg-api-dqezcvhufjacdhfr.southafricanorth-01.azurewebsites.net`) | `psql-hydra-prod` | `production`, `admin-device` | Manual workflow run **with required reviewers** |

## GitHub configuration

1. **Settings → Environments**: create `staging` and `production`. On `production` enable *Required
   reviewers* (owner/lead engineer) and restrict deployments to `main`.
2. Environment **secrets**:
   - `AZURE_WEBAPP_PUBLISH_PROFILE` — the App Service publish profile (Azure portal → App Service →
     *Download publish profile*; paste the whole XML file as the secret value). `azure/webapps-deploy`
     authenticates with it directly, so no `azure/login` step, Entra ID app registration or `id-token`
     permission is needed. Basic-auth publishing credentials (SCM) must be enabled on the web app for the
     profile to work. Treat the profile as a password: never commit it, and *Reset publish profile* in the
     portal (then update the secret) if it may have leaked.
   - `DATABASE_URL` — used only by the migration step (run with `DATABASE_SSL=true`).
3. Environment **variables**: `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_SLOT` (`production` or `staging` slot),
   `API_BASE_URL` (for the health smoke test). Current production values:

   | Variable | Value |
   | --- | --- |
   | `AZURE_WEBAPP_NAME` | `hydra-psg-api` |
   | `AZURE_WEBAPP_SLOT` | `production` |
   | `API_BASE_URL` | `https://hydra-psg-api-dqezcvhufjacdhfr.southafricanorth-01.azurewebsites.net` |

   A staging environment needs its own publish profile (one per web app/slot) and its own variables.
4. Repository secret `EXPO_TOKEN` and variables `EXPO_PUBLIC_*` for [EAS builds](EAS_BUILD.md).
5. Branch protection on `main`: require the **CI** workflow (`quality`, `api`, `mobile` jobs) to pass and at
   least one review.

## Release procedure

1. Merge to `main` with CI green (lint, typecheck, shared/API/mobile tests, API build, Expo export).
2. **Actions → Deploy API → Run workflow → staging**. The workflow:
   - installs, builds `@hydra/shared` and the API,
   - assembles a self-contained package (`dist/`, `migrations/`, production `node_modules`),
   - applies pending migrations with `npm run db:migrate:prod` (checksum-guarded, transactional; reset is refused in production),
   - deploys with `azure/webapps-deploy@v3` using the `AZURE_WEBAPP_PUBLISH_PROFILE` secret,
   - polls `${API_BASE_URL}/health` until `status: ok`.
3. Smoke test staging with a `preview` mobile build: sign in as each role, request → quote → accept → assign
   → QR check-in → materials → inspection → invoice → sandbox (Paystack test key) payment.
4. Run the same workflow for **production**; a reviewer approves the environment gate.
5. If a deployment slot is used, deploy to `staging` slot then swap: `az webapp deployment slot swap -g <resource-group> -n hydra-psg-api --slot staging`
   (download the publish profile of the `staging` slot for that environment's secret).

### Rollback

- Code: redeploy the previous commit with the workflow, or swap the slot back.
- Schema: migrations are forward-only. Write a new corrective migration; restore from point-in-time backup
  only for data corruption (`az postgres flexible-server restore … --restore-time <UTC>`).

## Database migrations

- Files live in `apps/api/migrations/NNN_description.sql`, applied in order, one transaction each, recorded
  in `schema_migrations` with a SHA-256 checksum. Never edit an applied migration — add a new one.
- The migration CLI reads only `DATABASE_URL`, `DATABASE_SSL` and `NODE_ENV`, so CI needs no application secrets.
- Seed data (`npm run db:seed`) is for development/demo only; never run it against production.

## Push notifications

Push uses the Expo Push Service (which delivers via FCM/APNs). Requirements:

- Android: in the Expo project, upload the **FCM v1 service-account key** (EAS → Credentials → Android →
  Google Service Account Key for FCM). iOS: EAS manages the APNs key when you build with EAS.
- API: `PUSH_NOTIFICATION_CONFIG=expo`, optional `EXPO_ACCESS_TOKEN` (enhanced push security in the Expo
  dashboard). The app registers its Expo push token after sign-in (`/profile/push-tokens`) and removes it on
  sign-out; invalid tokens reported by Expo receipts are pruned.

## Email

Password resets and invitations are sent by SMTP (`EMAIL_PROVIDER=smtp`, `EMAIL_API_KEY=smtps://user:pass@host:465`,
`EMAIL_FROM`). Use a provider that supports SPF/DKIM for the sending domain (e.g. Microsoft 365, SendGrid SMTP,
Amazon SES SMTP). `PASSWORD_RESET_URL=hydra://reset-password` opens the app's reset screen.

## Payments, SMS, Google

- Paystack: [PAYMENTS.md](PAYMENTS.md) — set the webhook URL to `https://<api>/api/v1/payments/webhook/paystack`.
- Twilio: [SMS_TWILIO.md](SMS_TWILIO.md).
- Google Sign-In: [GOOGLE_AUTH.md](GOOGLE_AUTH.md).

## Operational checklist (production)

- [ ] All Key Vault secrets set; API starts without “Unsafe production configuration”.
- [ ] `https://<api>/health` returns ok; Application Insights receiving telemetry.
- [ ] Paystack live keys, webhook URL and a R1 live test payment verified; refunds handled in the Paystack dashboard.
- [ ] Twilio sender approved (and WhatsApp template approved if WhatsApp is used).
- [ ] First owner account created with `npm run owner:create` (below).
- [ ] Missed-call automation left **disabled** until the owner reviews the template and consent wording.
- [ ] PostgreSQL PITR backups enabled and a restore rehearsed.

### Bootstrapping the first owner account

Production is never seeded. Create the first owner once from the App Service SSH console (or any shell with
the production settings):

```bash
OWNER_EMAIL=owner@psgelectrical.co.za OWNER_FIRST_NAME=… OWNER_LAST_NAME=… OWNER_PHONE='+27…' OWNER_PASSWORD='<temporary 12+ char password>' npm run owner:create
```

It uses the same audited `createStaff` service as the app and refuses to run if an owner already exists.
All later staff accounts are provisioned in-app by the owner (More → Staff accounts).
