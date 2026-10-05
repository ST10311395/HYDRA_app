# HYDRA — Architecture

HYDRA follows the four-layer architecture defined in the HYDRA documentation (PDF §5.2): **Presentation →
Business Logic → Repository / Data Access → PostgreSQL**, deployed on Azure. One npm-workspaces monorepo
holds the mobile app, the API and a shared domain package, so validation rules and state machines are
defined once and used on both sides of the wire.

```
┌──────────────────────── apps/mobile (Expo / React Native) ─────────────────────────┐
│ Expo Router screens (public · (auth) · customer · employee · admin)                  │
│ design-system · features · TanStack Query (server state) · Zustand (session/UI)      │
│ SecureStore (refresh token) · Camera/Location/Notifications · Socket.IO client       │
└───────────────▲──────────────── HTTPS JSON /api/v1 + WebSocket ─────────────────────┘
                │
┌───────────────┴──────────────── apps/api (Express 5) ──────────────────────────────┐
│ Presentation: controllers declared via defineRoute (auth → role → Zod → handler)     │
│ Business logic: services + JobLifecycle / invoice / leave / timesheet state machines │
│ Integrations: payments · storage · messaging · push · email · Google (interfaces)    │
│ Repository: I*Repository interfaces + Postgres*Repository (parameterised SQL only)   │
└───────────────▲──────────────────────────────────────────────────────────────────────┘
                │ pg (TLS in production)
┌───────────────┴──────────── PostgreSQL (Azure Flexible Server) ────────────────────┐
│ ~55 tables · FKs · CHECK constraints mirroring enums/state machines · partial unique │
│ indexes (one open shift, one confirmed check-in) · append-only audit trigger ·       │
│ immutable finalised payroll                                                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
packages/shared: enums, lifecycle transition tables, money/VAT/payroll maths, Zod DTOs, response types
```

## 1. Presentation layer

### Mobile (`apps/mobile/src`)

| Folder | Responsibility |
| --- | --- |
| `app/` | File-based routes. `(public)` marketing tabs (Home · Services · Work · Quote · Contact) open to guests; `(auth)`; `customer/`, `employee/`, `admin/` role areas each with a tab bar and stack screens. |
| `navigation/guards.ts` | `routeAccess(status, role)` — the root `Stack.Protected` guards mount a role area only for that role. |
| `design-system/` | Tokens (dark industrial palette from the wireframes), typography, buttons, cards, inputs, feedback (toasts, branded confirm dialog, skeletons). |
| `components/` | Brand header, tab bar, job cards/timeline/quote & invoice breakdowns, admin list scaffold and `OwnerGate`. |
| `features/` | Cross-role features: schedule view, materials logger, inspection report, profile/privacy, notifications, QR check-in helpers, Google sign-in wrapper, missed-call sync, export save/share. |
| `api/` | `client.ts` (typed fetch, single-flight token refresh, idempotency keys, binary downloads) and `queries.ts` (query keys + hooks). |
| `store/auth.ts` | Session store; access token in memory, refresh token in SecureStore. |
| `hooks/` | Network status, push registration + deep links, realtime subscription, `useSyncFrom` (render-phase state seeding). |

Offline/weak network: the React Query cache for public content and the electrician's schedule/jobs is
persisted (never tokens or finance data) and cleared on sign-out; an offline banner is shown; sensitive
writes carry an `Idempotency-Key`; the inspection form keeps a local draft.

### API controllers (`apps/api/src/controllers`)

Every endpoint is declared once with `defineRoute`, which wires the Express route, authentication,
role check, Zod validation of body/query/params and the OpenAPI entry. Controllers contain no SQL and no
business rules; they call services with the verified `AuthContext`.

## 2. Business logic layer (`apps/api/src/services`)

- **Lifecycle**: `jobLifecycle.ts` applies the shared transition table (`packages/shared/src/lifecycle.ts`);
  illegal transitions are rejected and the DB CHECK constraint is a second line of defence. Milestones are
  advanced by the same transitions so the customer timeline is server-driven.
- **Ownership**: `accessControl.ts` scopes every read/write after the role check (customer → own records,
  electrician → assigned jobs, admin → all, owner-only operations separately).
- **Transactions + events**: `transactional()` runs a unit of work and collects notifications/realtime
  events that are only emitted after commit.
- **Domain services**: auth & tokens, jobs, quotes, dispatch (assignment, QR, GPS check-in, admin override),
  inventory (atomic batch stock decrement with row locks), inspections, billing (invoices, gateway checkout,
  signed idempotent webhooks, partial and manual payments), rewards/discounts, workforce (schedules,
  timesheets, leave, payroll draft → approve → finalise → correction), enquiries (traceable conversion),
  missed calls (rule-based classification + human review), notifications, reports/exports, privacy (POPIA).
- **Scheduled jobs** (`src/jobs/tasks.ts`): `invoiceOverdue` (SENT/PARTIALLY_PAID past due → OVERDUE +
  reminders), `quoteExpiry`, `sessionCleanup` (expired refresh/reset tokens), `orphanUploads` (unattached
  development uploads). They run in-process in development and as a separate worker/WebJob in production.
  Low-stock alerts are raised inline when a stock movement crosses the reorder level.

## 3. Repository / data-access layer (`apps/api/src/repositories`)

Each aggregate has an interface (`IJobRepository`, …) and a PostgreSQL implementation that receives a
`Queryable` (pool or transaction client). Only parameterised queries are used. Services depend on the
interfaces, which keeps the business layer testable and prevents SQL leaking upward (PDF §5.1).

## 4. PostgreSQL data layer (`apps/api/migrations`)

| Migration | Contents |
| --- | --- |
| `001_identity.sql` | users, auth identities (Google), refresh tokens, password-reset tokens, login attempts, customers, employees, admins, consents, data-subject requests, push tokens |
| `002_content_and_jobs.sql` | service types, portfolio, FAQs, partners, team, offices, department contacts, files, jobs, assignments, status history, milestones, QR tokens, check-ins, notes, attachments |
| `003_quotes_materials_billing.sql` | quotes + items, materials, job materials, stock movements, inspections, invoices + items, payments, payment webhook events (idempotency), rewards, discounts |
| `004_workforce.sql` | schedules, timesheets (one open shift per employee), leave, payroll + items (immutable once finalised) |
| `005_comms_and_system.sql` | contacts, contact queries, missed calls, AI message log, notifications, audit log (append-only trigger), data-export log, app settings, idempotency keys |

Migrations are applied in order, each in its own transaction, and checksummed so an edited migration is
detected (schema-drift guard).

## 5. Cloud services (Azure)

| Concern | Service | Code seam |
| --- | --- | --- |
| API hosting | Azure App Service (Linux, Node 24), deployment slots | `.github/workflows/deploy-api.yml` |
| Database | Azure Database for PostgreSQL Flexible Server (TLS, PITR backups) | `DATABASE_URL`, `DATABASE_SSL=true` |
| Files (photos, evidence, CoC PDFs) | Azure Blob Storage, private container, short-lived SAS URLs | `integrations/storage.ts` (`AzureBlobStorage`) |
| Secrets | Azure Key Vault referenced from App Service settings | `.env.example` names |
| Monitoring | Application Insights (`APPLICATIONINSIGHTS_CONNECTION_STRING`), structured pino logs with request IDs | `config/logger.ts` |
| Scheduled work | App Service WebJob / Azure Functions timer running `npm run jobs` | `src/jobs/worker.ts` |
| Edge | Azure Front Door (optional) in front of App Service; `TRUST_PROXY=true` | `app.ts` |
| Push | Expo Push Service (FCM/APNs behind it) | `integrations/push.ts` |
| Payments | Paystack (ZAR) | `integrations/payments.ts` |
| SMS / WhatsApp | Twilio Programmable Messaging | `integrations/messaging.ts` |
| Mobile builds | EAS Build / Submit | `apps/mobile/eas.json`, `.github/workflows/eas-build.yml` |

## 6. Realtime

Socket.IO rooms per user (`user:<id>`), per job (`job:<id>`, joined with `job:subscribe` after an
ownership check) and for admins. After a transaction commits, the API emits `job.updated`,
`job.milestone`, `job.checkin`, `quote.ready`, `schedule.updated`, `invoice.updated`, `payment.confirmed`,
`inventory.low_stock` and `notification.new`; the mobile hooks invalidate the matching React Query keys so
the job timeline and dashboards update live.

## 7. Key flows (sequence)

1. Customer requests service → `POST /jobs` (REQUESTED) → admins notified.
2. Admin builds quote → `POST /jobs/:id/quote` (QUOTED) → customer accepts (`QUOTE_ACCEPTED`) in a transaction.
3. Admin checks `/jobs/availability/electricians` and assigns → SCHEDULED, append-only assignment log.
4. Customer shows rotating QR → electrician scans → GPS → `POST /jobs/:id/checkin` → IN_PROGRESS (+ shift started).
5. Materials logged atomically, work completed → INSPECTION_PENDING → PASS inspection → COMPLETED.
6. Admin generates invoice → customer pays via gateway → signed webhook settles payment + invoice atomically → rewards credited once when PAID.

## 8. HYDRA Smart Quote (AI assistant)

Full design: [AI_ASSISTANT.md](AI_ASSISTANT.md). It follows the same four layers:

```
customer/ai screens ──▶ aiController (defineRoute) ──▶ aiAssistantService / aiAdminService
                                                       └▶ services/ai/orchestrator
                                                           ├─ ai/engine (safety · classification · severity · pricing · decision)  ← deterministic
                                                           ├─ KnowledgeRetriever (PostgreSQL FTS + keywords; vector-ready)        ← approved knowledge only
                                                           └─ AiProvider (mock | anthropic | openai | gemini | none)              ← suggestions only
                                                       └▶ PostgresAiRepository / PostgresKnowledgeRepository ──▶ migration 006 tables
```

Accepted proposals hand off to the existing job model (`REQUESTED`, source `AI_ASSESSMENT`); notifications,
realtime (`ai.updated`), audit, files and idempotency reuse the existing infrastructure.

