# HYDRA REST API

- Base URL: `https://<host>/api/v1` (local: `http://localhost:4000/api/v1`)
- Format: JSON over HTTPS. Money values are numbers in ZAR with 2 decimals; timestamps are ISO-8601 (UTC);
  dates are `YYYY-MM-DD` (business timezone Africa/Johannesburg).
- Interactive docs: **Swagger UI at `/api/docs`**, raw document at `/api/docs.json`. A snapshot is committed at
  [`docs/openapi.json`](openapi.json) (`npm run openapi -w @hydra/api` regenerates it). The OpenAPI document is
  generated from the same Zod schemas that validate requests, so it cannot drift from the implementation.
- Health: `GET /health` → `{ "status": "ok", "database": "ok", ... }` (503 `{ "status": "degraded" }` if the database is unreachable).

## Authentication

1. `POST /auth/login` `{ identifier, password }` (email, or staff number for electricians) — or
   `POST /auth/google` `{ idToken, acceptPrivacyPolicy? }` — returns an `AuthSession`:

```json
{
  "user": { "id": "…", "role": "CUSTOMER", "firstName": "Thandi", "customerId": "…", "onboardingCompleted": true, "hasGoogleLink": false },
  "accessToken": "eyJhbGciOiJIUzI1NiJ9…",
  "accessTokenExpiresAt": "2026-09-29T10:15:00.000Z",
  "refreshToken": "rt_…",
  "refreshTokenExpiresAt": "2026-10-29T10:00:00.000Z"
}
```

2. Send `Authorization: Bearer <accessToken>` on every protected request.
3. On `401`, call `POST /auth/refresh` `{ refreshToken }` once; it returns a new pair and revokes the old
   refresh token. Re-using a rotated refresh token revokes the whole session.
4. `POST /auth/logout` `{ refreshToken }` revokes the session.

Roles: `CUSTOMER`, `EMPLOYEE` (electrician), `ADMIN_OFFICE`, `ADMIN_OWNER`. Access below: **Public**
(no token), **Signed-in** (any role; ownership still applies), or the listed roles. **Admin** = office or
owner; **Staff** = electrician, office or owner. Ownership is enforced after the role check: customers see
only their own records, electricians only jobs assigned to them.

## Errors

Every error uses one shape with a conventional HTTP status:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Some fields need attention", "requestId": "b3f…", "details": [{ "path": "siteAddress", "message": "Must be at least 5 characters" }] } }
```

| Status | Codes (examples) |
| --- | --- |
| 400 | `BAD_REQUEST` (malformed input, invalid `Idempotency-Key`) |
| 401 | `UNAUTHORIZED` — missing/expired/invalid token, wrong credentials or locked account (one generic message), revoked session |
| 403 | `FORBIDDEN` (role not permitted) |
| 428 | `CONSENT_REQUIRED` — first Google sign-in must accept the privacy notice (`acceptPrivacyPolicy: true`) |
| 404 | `NOT_FOUND` — also returned for records outside your ownership scope |
| 409 | `SCHEDULE_CONFLICT`, `ALREADY_CHECKED_IN`, `QR_ALREADY_USED`, `ALREADY_CLOCKED_IN`, `DUPLICATE_MISSED_CALL`, `EMAIL_IN_USE`, `CONFLICT` |
| 422 | `VALIDATION_FAILED` (with `details`), business rules such as `ILLEGAL_JOB_TRANSITION`, `QUOTE_NOT_ACCEPTED`, `INSUFFICIENT_STOCK`, `JOB_NOT_COMPLETED`, `INVOICE_EXISTS`, `INVOICE_NOT_DRAFT`, `INVOICE_NOT_PAYABLE`, `DISCOUNT_NOT_ELIGIBLE`, `LEAVE_OVERLAP`, `QR_EXPIRED`, `SHIFT_OPEN`, `TIMESHEET_IN_PAYROLL`, `CANCELLATION_NOT_ALLOWED` |
| 429 | `RATE_LIMITED` |
| 502 / 503 | `PAYMENT_GATEWAY_ERROR`, `PAYMENT_GATEWAY_UNAVAILABLE`, `SERVICE_UNAVAILABLE` |

## Conventions

- **Pagination**: list endpoints accept `page` (1-based), `pageSize` (≤100) and `search`, and return
  `{ items, page, pageSize, total }`.
- **Idempotency**: `POST /jobs` and `POST /invoices/:id/payments` accept an `Idempotency-Key` header
  (8–64 chars `[A-Za-z0-9_-]`); retries with the same key return the original result.
- **Filters**: `GET /jobs?status=SCHEDULED,IN_PROGRESS&employeeId=…&sort=scheduled`; `GET /invoices?status=OVERDUE`;
  `GET /materials?lowStockOnly=true`; `GET /audit-logs?entityType=job&action=JOB_ASSIGNED`.
- **Realtime**: Socket.IO on the same origin with `auth: { token }`; emit `job:subscribe` with a job id to
  receive that job's `job.updated`, `job.milestone` and `job.checkin` events.

## Examples

Request a service (customer):

```http
POST /api/v1/jobs
Authorization: Bearer <customer token>
Idempotency-Key: m-lx2k3-9f8a7b6c5d
Content-Type: application/json

{ "serviceTypeId": "0b7f…", "siteAddress": "12 Main Road, Sandton", "description": "Main breaker trips when the geyser switches on.",
  "urgency": "STANDARD", "preferredDate": "2026-10-02", "preferredTimeWindow": "MORNING", "contactConfirmed": true, "attachmentIds": [] }
```
→ `201` job detail with `status: "REQUESTED"` and server-driven `milestones`, `allowedActions`.

Create and send a quote (admin):

```http
POST /api/v1/jobs/{id}/quote
{ "items": [ { "kind": "LABOUR", "description": "Installation labour", "quantity": 6, "unitPrice": 240 },
             { "kind": "MATERIAL", "description": "63A DB board", "quantity": 1, "unitPrice": 645 } ],
  "discountAmount": 0, "validUntil": "2026-10-15", "terms": "Valid 14 days", "send": true }
```
→ `201` quote with totals computed server-side (VAT from settings); the customer is notified.

Assign an electrician (admin, only after the quote is accepted):

```http
GET  /api/v1/jobs/availability/electricians?start=2026-10-02T06:00:00Z&end=2026-10-02T10:00:00Z&jobId={id}
POST /api/v1/jobs/{id}/assign
{ "employeeId": "…", "scheduledStart": "2026-10-02T06:00:00Z", "scheduledEnd": "2026-10-02T10:00:00Z", "overrideConflicts": false }
```

QR + GPS arrival (electrician):

```http
POST /api/v1/jobs/{id}/checkin
{ "qrToken": "HYDRA1:<jobId>:<opaque token>", "location": { "latitude": -26.1076, "longitude": 28.0567, "accuracy": 8 } }
```
→ `200 { job, shiftStarted, distanceMetres }`, job now `IN_PROGRESS`.

Pay an invoice (customer):

```http
POST /api/v1/invoices/{id}/payments
Idempotency-Key: m-…
{ "amount": 1000 }          ← omit for the full balance
```
→ `201 { id, status: "PENDING", checkoutUrl }`. Open `checkoutUrl`, then poll `GET /payments/{id}`. The
gateway's signed webhook (`POST /payments/webhook/paystack`) settles the payment and invoice.

Owner export:

```http
POST /api/v1/exports
{ "type": "INVOICES", "format": "CSV", "from": "2026-09-01", "to": "2026-09-30" }
```
→ file download with `Content-Disposition` and `X-Row-Count`; logged in the export log and audit trail.

## Endpoint reference

Generated from the OpenAPI document (dev-only sandbox checkout routes are not mounted in production).

### Auth

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Register a customer account |
| POST | `/auth/login` | Public | Sign in with email (customer/admin) or staff number (employee) + password |
| POST | `/auth/google` | Public | Sign in with a Google ID token (verified server-side) |
| POST | `/auth/google/link` | Signed-in | Link a Google identity to the signed-in account |
| POST | `/auth/refresh` | Public | Rotate refresh token and issue a new access token |
| POST | `/auth/logout` | Signed-in | Revoke the current session |
| POST | `/auth/forgot-password` | Public | Request a password reset link (always 202) |
| POST | `/auth/reset-password` | Public | Reset password with a single-use token |
| GET | `/auth/me` | Signed-in | Current user |
| POST | `/auth/change-password` | Signed-in | Change password (revokes all sessions) |

### Profile

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/profile` | Signed-in | My profile |
| PATCH | `/profile` | Signed-in | Correct my profile details (POPIA information quality) |
| POST | `/profile/onboarding-complete` | Signed-in | Mark guided walkthrough as completed (PDF Story 23) |
| POST | `/profile/push-tokens` | Signed-in | Register an Expo push token for this device |
| DELETE | `/profile/push-tokens` | Signed-in | Unregister a push token |
| POST | `/profile/data-requests` | Signed-in | Submit a POPIA data-subject request (access / correction / deletion) |
| GET | `/profile/data-export` | Signed-in | Download a copy of my personal data (POPIA access right) |

### Content

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/public-content` | Public | Company details, metrics, accreditations and testimonial |
| GET | `/service-types` | Signed-in | Service catalogue |
| POST | `/service-types` | Admin | Create a structured service type |
| GET | `/service-types/{id}` | Public | Service detail |
| PATCH | `/service-types/{id}` | Admin | Update a service type |
| GET | `/portfolio` | Public | Recent work / case studies |
| GET | `/portfolio/{id}` | Public | Case study detail |
| GET | `/faqs` | Public | FAQs |
| GET | `/partners` | Public | Partner directory |
| GET | `/team` | Public | Team profiles |
| GET | `/offices` | Public | Regional offices |
| GET | `/departments` | Public | Department direct contacts |

### Jobs

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/jobs` | Signed-in | List jobs (scoped: customer → own, electrician → assigned, admin → all) |
| POST | `/jobs` | Customer | Request a service (creates a REQUESTED job) |
| POST | `/jobs/admin` | Admin | Admin logs a job on behalf of a customer |
| GET | `/jobs/{id}` | Signed-in | Job detail with milestones, check-ins, materials, inspection, quote and invoice |
| POST | `/jobs/{id}/cancel` | Customer, Admin | Cancel a job (lifecycle-guarded) |
| POST | `/jobs/{id}/notes` | Signed-in | Add a job note |
| POST | `/jobs/{id}/attachments` | Signed-in | Attach uploaded photos to a job |

### Quotes

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/jobs/{id}/quote` | Admin | Create (and optionally send) a quote |
| GET | `/quotes` | Customer, Admin | List quotes |
| GET | `/quotes/{id}` | Customer, Admin | Quote detail |
| POST | `/quotes/{id}/send` | Admin | Send a draft quote |
| POST | `/quotes/{id}/accept` | Customer | Accept a quote (transactional) |
| POST | `/quotes/{id}/decline` | Customer | Decline a quote with optional reason |

### Dispatch

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/jobs/availability/electricians` | Admin | Electrician availability and conflicts for a time window |
| POST | `/jobs/{id}/assign` | Admin | Assign or reassign an electrician (after quote acceptance) |
| GET | `/jobs/{id}/qr` | Customer | Customer: issue a short-lived arrival QR code |
| POST | `/jobs/{id}/checkin` | Electrician | Electrician: QR + GPS arrival check-in |
| POST | `/jobs/{id}/confirm-arrival` | Admin | Admin: confirm arrival when QR scanning fails (audited) |
| POST | `/jobs/{id}/delay` | Electrician | Electrician: report a delay en route |

### Field work

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/jobs/{id}/milestones` | Staff | Add an on-site milestone |
| POST | `/jobs/{id}/milestones/{milestoneId}/complete` | Staff | Complete a milestone |
| POST | `/jobs/{id}/materials` | Staff | Log materials used (atomic stock decrement) |
| DELETE | `/jobs/{id}/materials/{jobMaterialId}` | Staff | Reverse a material entry (stock returned) |
| POST | `/jobs/{id}/complete` | Electrician | Electrician: mark on-site work complete (→ inspection pending) |

### Compliance

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/jobs/{id}/inspection` | Electrician | Submit inspection / compliance report (PASS → job completed) |
| GET | `/inspection-reports` | Signed-in | Inspection / CoC reports (scoped) |
| GET | `/inspection-reports/{id}` | Signed-in | Inspection report detail |

### Billing

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/jobs/{id}/invoice` | Admin | Generate an invoice from a completed job |
| GET | `/invoices` | Customer, Admin | List invoices (customer → own) |
| GET | `/invoices/{id}` | Customer, Admin | Invoice with line items, payments and discounts |
| DELETE | `/invoices/{id}` | Admin | Delete a draft (never sent) invoice |
| GET | `/invoices/{id}/pdf` | Customer, Admin | Download the invoice as a PDF (customer → own) |
| POST | `/invoices/{id}/send` | Admin | Send a draft invoice |

### Payments

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/invoices/{id}/payments` | Customer | Start a (partial) payment — returns gateway checkout URL. Send Idempotency-Key header. |
| POST | `/invoices/{id}/manual-payments` | Admin | Admin records an EFT/cash payment (audited) |
| GET | `/payments` | Customer, Admin | Payment history |
| GET | `/payments/{id}` | Customer, Admin | Payment status (poll after checkout) |
| POST | `/payments/webhook/{provider}` | Public | Payment gateway webhook (signature-verified, idempotent) |
| GET | `/payments/sandbox/checkout/{reference}` | Public | DEV ONLY sandbox checkout page |
| POST | `/payments/sandbox/checkout/{reference}/complete` | Public | DEV ONLY sandbox outcome → signed webhook |

### Rewards

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/rewards` | Customer | My rewards balance and tier |
| GET | `/rewards/transactions` | Customer | Points history |
| GET | `/discounts` | Customer, Admin | Customer: available offers with eligibility · Admin: all discounts |
| POST | `/discounts` | Admin | Create a discount offer |
| PATCH | `/discounts/{id}` | Admin | Update a discount offer |
| POST | `/discounts/{id}/redeem` | Customer | Redeem an offer against an eligible invoice (atomic) |

### Inventory

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/materials` | Staff | Search material catalogue |
| POST | `/materials` | Admin | Create a material item |
| GET | `/materials/{id}` | Admin | Material item detail |
| PATCH | `/materials/{id}` | Admin | Edit a material item |
| POST | `/materials/{id}/archive` | Admin | Archive / restore a material |
| POST | `/materials/{id}/adjust` | Admin | Restock or adjust stock (audited movement) |
| GET | `/inventory/low-stock` | Admin | Items at or below reorder level |
| GET | `/stock-movements` | Admin | Stock movement ledger |

### Workforce

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/schedules` | Staff | Calendar events (electrician → own; default today + 7 days) |
| POST | `/schedules` | Admin | Create a calendar event with conflict check |
| DELETE | `/schedules/{id}` | Admin | Delete a non-job calendar event |
| POST | `/timesheets/clock-in` | Electrician | Clock in (one open shift at a time) |
| POST | `/timesheets/clock-out` | Electrician | Clock out (hours calculated server-side) |
| GET | `/timesheets/current` | Electrician | Current shift and hours today |
| GET | `/timesheets` | Staff | Timesheets (electrician → own) |
| POST | `/timesheets/{id}/review` | Admin | Confirm or reject a timesheet |
| POST | `/leave-requests` | Electrician | Submit a leave request |
| GET | `/leave-requests` | Staff | Leave requests (electrician → own) |
| POST | `/leave-requests/{id}/cancel` | Staff | Cancel a pending/future leave request |
| POST | `/leave-requests/{id}/decision` | Admin | Approve or reject leave (updates availability) |

### Payroll

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/payroll/preview` | Admin | Preview payroll from confirmed timesheets |
| POST | `/payroll` | Admin | Process payroll into DRAFT records (figures computed server-side) |
| GET | `/payroll` | Admin | Payroll records |
| POST | `/payroll/{id}/approve` | Owner | Owner approves a draft payroll |
| POST | `/payroll/{id}/finalise` | Owner | Owner finalises payroll (immutable afterwards) |
| DELETE | `/payroll/{id}` | Admin | Discard a draft payroll (releases timesheets) |
| POST | `/payroll/{id}/corrections` | Owner | Owner creates a linked correction for finalised payroll |

### People

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/employees` | Admin | Employees with live status |
| GET | `/employees/{id}` | Staff | Employee profile (electrician → self only, pay fields hidden) |
| PATCH | `/employees/{id}` | Owner | Update employee details / pay rate (owner) |
| GET | `/customers` | Admin | Customers |
| GET | `/customers/{id}` | Admin | Customer detail |
| GET | `/admins` | Owner | Staff accounts (admins and electricians) |
| POST | `/admins/staff` | Owner | Owner provisions a staff account |
| PATCH | `/users/{id}/status` | Owner | Enable / disable an account (revokes sessions) |

### Dashboards

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/dashboard/customer` | Customer | Customer dashboard |
| GET | `/dashboard/employee` | Electrician | Electrician “Today” view |
| GET | `/dashboard/admin` | Admin | Operations centre KPIs and activity |

### Enquiries

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/contact-queries` | Signed-in | Submit a public contact / quotation enquiry (no login) |
| GET | `/contact-queries` | Admin | Enquiry inbox |
| GET | `/contact-queries/{id}` | Admin | Enquiry detail |
| PATCH | `/contact-queries/{id}` | Admin | Triage an enquiry |
| POST | `/contact-queries/{id}/convert` | Admin | Convert enquiry to customer + job (traceable) |

### Missed calls

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/missed-calls/status` | Admin | Feature flag, consent and provider status for this device/admin |
| POST | `/missed-calls/consent` | Admin | Grant or withdraw call-log monitoring consent (POPIA) |
| POST | `/missed-calls` | Admin | Log a missed call (device monitor or manual) and run the auto-response workflow |
| GET | `/missed-calls` | Admin | Missed call log |
| GET | `/missed-calls/{id}` | Admin | Missed call detail |
| POST | `/missed-calls/{id}/reply` | Admin | Approve/send a reply (human-in-the-loop) |
| POST | `/missed-calls/{id}/dismiss` | Admin | Dismiss without replying |
| GET | `/message-logs` | Admin | Outgoing automated message log (AI_MESSAGE_LOG) |

### Notifications

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/notifications` | Signed-in | My notifications |
| POST | `/notifications/{id}/read` | Signed-in | Mark as read |
| POST | `/notifications/read-all` | Signed-in | Mark all as read |

### Settings

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/settings` | Admin | Business settings and integration status |
| PATCH | `/settings` | Owner | Update privileged configuration (owner) |

### Reports

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/reports/summary` | Owner | Business summary for a date range |
| POST | `/exports` | Owner | Export a data category as CSV/PDF (owner-only, audited) |
| GET | `/exports` | Owner | Export history (DATA_EXPORT_LOG) |
| GET | `/audit-logs` | Owner | Append-only audit trail |
| GET | `/data-requests` | Owner | POPIA data-subject requests |
| POST | `/data-requests/{id}/resolve` | Owner | Resolve a data-subject request (deletion = anonymisation) |

### Files

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/files` | Signed-in | Upload a job photo, inspection evidence, compliance document or profile image (multipart field "file") |
| GET | `/files/{id}` | Signed-in | Get a fresh time-limited URL for a file you may access |
| GET | `/files/raw/{path}` | Public | Signed local file download (development storage) |

### Smart Quote (AI) — details in [AI_ASSISTANT.md](AI_ASSISTANT.md)

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/ai/status` | Signed-in | Availability, simulation label, limits, disclaimer |
| POST | `/ai/conversations` | Customer | Start an assessment (message, photo ids, property type, area, urgency) — idempotent |
| GET | `/ai/conversations` | Customer | My AI assessments (paginated) |
| GET | `/ai/conversations/{id}` | Customer (own) | Conversation, assessment, proposal, allowed actions |
| POST | `/ai/conversations/{id}/messages` | Customer (own) | Reply / add information and photos — idempotent |
| POST | `/ai/conversations/{id}/accept` | Customer (own) | Accept the preliminary proposal → REQUESTED job — idempotent |
| POST | `/ai/conversations/{id}/decline` | Customer (own) | Decline the proposal |
| POST | `/ai/conversations/{id}/request-review` | Customer (own) | Ask for a person |
| POST | `/ai/conversations/{id}/feedback` | Customer (own) | “Was the AI assessment helpful?” after completion |
| GET | `/ai/admin/summary` | Admin | Queue counts |
| GET | `/ai/admin/cases` | Admin | Review queue (`tab`, `severity`, `search`) |
| GET | `/ai/admin/cases/{id}` | Admin | Full case incl. audit trail and price calculation |
| POST | `/ai/admin/cases/{id}/reply` | Admin | Team reply or information request |
| POST | `/ai/admin/cases/{id}/assessment` | Admin | Edit summary / category / severity / price (new version) |
| POST | `/ai/admin/cases/{id}/proposal` | Admin | Approve AI response / send proposal |
| POST | `/ai/admin/cases/{id}/convert` | Admin | Convert to a REQUESTED job |
| POST | `/ai/admin/cases/{id}/close` | Admin | Close the case |
| POST | `/ai/admin/cases/{id}/feedback` | Admin | Rate assessment / severity / price |
| POST | `/ai/admin/cases/{id}/knowledge` | Admin | Approve the resolution as knowledge |
| GET / POST | `/ai/knowledge` | Admin | List / create knowledge entries |
| GET / PATCH | `/ai/knowledge/{id}` | Admin | Entry with revisions / edit (new version) |
| POST | `/ai/knowledge/{id}/approve`, `/ai/knowledge/{id}/active` | Admin (approval per owner setting) | Approve / activate / deactivate |
| POST / DELETE | `/ai/knowledge/{id}/archive`, `/ai/knowledge/{id}` | Owner | Archive / delete |
| GET | `/ai/settings`, `/ai/policies/{kind}/versions` | Admin | Settings, policies, provider status (no secrets), history |
| PUT | `/ai/settings`, `/ai/policies/severity`, `/ai/policies/pricing` | Owner | New policy versions |
| GET | `/ai/analytics` | Admin | Analytics from stored data |
| GET | `/jobs/{id}/ai-assessment` | Job access | AI summary behind a job (electricians: no pricing) |

