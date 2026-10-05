# HYDRA — Security and Privacy

Security is release-blocking (spec §17). Every control below is implemented in code; file references
point to where. The automated security tests live in `apps/api/tests/security.test.ts` (API) and
`apps/mobile/src/__tests__` (client token handling, guards, role permissions).

## 1. Threat assumptions

| Threat | Assumption / mitigation |
| --- | --- |
| Hostile or modified client | The mobile app is untrusted. Roles, customer/employee IDs, prices, payment status and payroll amounts sent by a client are never trusted — the server derives them from the verified token and the database (spec §14.23). |
| Stolen access token | Short lifetime (15 min), memory-only on the device, never logged. |
| Stolen refresh token | Stored only in the OS keystore; rotated on every use; reuse of a rotated token revokes the whole session family. |
| Credential stuffing / brute force | Per-IP rate limits, per-identifier failure counting, account lockout (5 failures → 15 min). Generic error messages prevent account enumeration. |
| IDOR (editing IDs) | Ownership check after every role check (`services/accessControl.ts`). Tested: customer A cannot read customer B's jobs, quotes, invoices or files. |
| Forged payment callbacks | Webhook signatures verified with constant-time comparison; events recorded once (idempotent); amounts reconciled server-side. |
| Malicious uploads | Magic-byte type detection, per-purpose size/type rules, random server-side object keys, private storage, time-limited URLs. |
| Insider misuse | Owner-only operations (exports, audit, payroll approval/finalisation, settings, staff administration) are enforced on the API; all sensitive operations are audited in an append-only log. |
| Lost/stolen phone | Refresh token bound to the keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); owner can disable the account, which revokes every session. |

## 2. Authentication

**Local accounts** (`services/authService.ts`)
- bcrypt hashes only (cost 12 in production); plaintext passwords are never stored or logged.
- Minimum 12 characters (NIST 800-63B length-over-complexity), max 128.
- Customers and admins sign in with email; electricians with staff number (e.g. `PSG-E-0003`) or email.
- 5 consecutive failures lock the account for 15 minutes; failures are also counted per identifier so
  non-existent accounts behave identically. The error is always “Incorrect email/staff number or password”.
- Password reset: random single-use token, stored hashed, 30-minute expiry, always answered with 202
  (no enumeration). Changing/resetting a password revokes all sessions.
- Security events (login success/failure, lockout, reset, password change, Google link, token reuse) are audited.

**Google Sign-In** (`integrations/google.ts`, [GOOGLE_AUTH.md](GOOGLE_AUTH.md))
- The app obtains a Google **ID token** with the native SDK; the API verifies signature, issuer, expiry and
  that the audience is one of HYDRA's OAuth client IDs, and requires `email_verified`.
- The Google token is never used as a HYDRA session: after verification HYDRA issues its own token pair.
- The provider subject (`sub`) is stored in `auth_identities`; linking uses the subject, not the email.
- First-time Google **customers** must accept the privacy notice before an account is created.
- **Staff** (electricians/admins) can only use Google after linking it from their signed-in profile —
  a Google login never creates or elevates a staff account, and never takes over an existing account by
  matching email alone.

## 3. Token handling (spec §6.3)

| Token | Lifetime | Where it lives | Notes |
| --- | --- | --- | --- |
| Access JWT (HS256, `jose`) | 15 min (`JWT_ACCESS_TTL`) | Memory only (Zustand) | Claims: `sub`, role, customer/employee/admin id, `sid`, `iat`, `exp`, issuer/audience. |
| Refresh token | 30 days (`JWT_REFRESH_TTL`) | iOS Keychain / Android Keystore via SecureStore; server stores only a SHA-256 hash | Rotated on every refresh; the old token is revoked; presenting a revoked token revokes the whole session (reuse detection). |
| QR arrival token | 15 min, single use | Customer screen only | Opaque random value, hashed at rest, bound to one job; never a predictable DB id. |

The mobile client refreshes once on a 401 (single-flight, so parallel requests share one refresh) and signs
the user out if the refresh is rejected. Tokens are never written to AsyncStorage or logs; the persisted
query cache excludes all authenticated finance data and is wiped on sign-out.

## 4. Authorisation (RBAC + ownership)

Pipeline for every protected route (`routes/define.ts`): authenticate → verify token → role check →
validate input (Zod) → service applies ownership/resource scope → business logic → audit.

| Role | Scope |
| --- | --- |
| Guest | Public content, contact enquiry, register/login. |
| CUSTOMER | Own profile, jobs, quotes, invoices, payments, rewards, inspection reports and files only. |
| EMPLOYEE | Own profile, timesheets, leave and schedule; jobs assigned to them (customer/site details only for those); no payroll, no finance, no admin data. Pay-rate fields are hidden even on their own profile. |
| ADMIN_OFFICE | Operations: enquiries, jobs, quotes, dispatch, inventory, invoices, discounts, workforce, draft payroll, missed calls, settings (read-only). |
| ADMIN_OWNER | Everything above plus payroll approve/finalise/corrections, reports, exports, audit log, settings changes, staff/user administration, POPIA data-request resolution. |

The mobile app mirrors these rules (role-guarded route groups, `OwnerGate`, owner-only menu items) purely
for UX; the API is the security boundary.

## 5. Input validation and injection prevention

- Zod schemas from `packages/shared` validate every body, query and path parameter (UUIDs, string lengths,
  enums, numeric bounds, date ranges, phone/email formats). The same schemas drive client-side form validation.
- All SQL is parameterised in repositories; no string-concatenated SQL with user input.
- Body limits: JSON 256 KB, urlencoded 16 KB; uploads per-purpose (below).
- Helmet security headers with a `default-src 'none'` CSP for API responses; HSTS in production; CORS allow-list
  (`CORS_ORIGINS`); `x-powered-by` disabled.
- Rate limits (`middleware/rateLimits.ts`): API 300/min/IP; login 10 per 15 min; password reset 5/hour;
  registration 10/hour; contact form 8/hour (plus honeypot field); uploads 20/min.
- Errors use one structured shape `{ error: { code, message, requestId, details? } }`; stack traces and SQL
  errors are never returned.

## 6. Files and uploads (`services/fileService.ts`, `integrations/storage.ts`)

| Purpose | Allowed types (magic-byte sniffed) | Max size |
| --- | --- | --- |
| Job photo / inspection evidence | JPEG, PNG, WebP, HEIC | 8 MB |
| Profile image | JPEG, PNG, WebP | 4 MB |
| Compliance document | PDF, JPEG, PNG | 15 MB |

Objects get random keys (no user-supplied paths); production uses a **private** Azure Blob container with
short-lived read SAS URLs issued only after an access check. Storage keys never reach the mobile app.
Development uses local disk with HMAC-signed expiring URLs. Orphaned uploads are cleaned up by a scheduled task.

## 7. Payments

- Card data never touches HYDRA: the customer pays on the gateway's hosted checkout (Paystack), opened in an
  in-app browser. No card number, CVV or raw card data is stored or logged.
- Checkout creation requires an `Idempotency-Key`; payment and invoice updates happen in one transaction;
  partial payments never mark an invoice paid; webhook events are stored with a unique event id so duplicates
  are ignored; signatures are HMAC-SHA512 (Paystack) and verified with constant-time comparison.
- The development “simulated” gateway uses the same signed-webhook pipeline and is **refused at startup in
  production** — HYDRA can never fake a real payment.
- Rewards are credited once, only when an invoice reaches PAID (unique per invoice); redemption and invoice
  reduction are one transaction.

## 8. Data protection at rest and in transit

- HTTPS/TLS everywhere in production; the mobile app refuses a non-`https` API URL in production builds
  (`src/config.ts`); the API requires `DATABASE_SSL=true` and an `https` public base URL in production.
- Azure-managed encryption at rest for PostgreSQL and Blob Storage; secrets in Key Vault (App Service Key
  Vault references), never in source control (`.gitignore` covers `.env`, keystores, signing files).
- Logs are structured (pino) with request IDs and redaction of authorization headers, tokens, passwords and
  provider payloads; phone numbers in missed-call logs are masked.

## 9. Audit logging (spec §17.5)

`audit_logs` captures actor user id, role, action, entity type/id, timestamp, request id, IP and safe
metadata. A database trigger rejects UPDATE and DELETE, so the log is append-only even for the database
owner role used by the app. Audited: login/security events, role/account changes, job creation/assignment/
reassignment/cancellation, quote creation/acceptance, stock adjustments and overrides, invoice generation,
payment processing (gateway and manual), discount redemption, payroll actions, settings changes, data exports,
POPIA requests, and missed-call consent/replies/dismissals. The owner reviews it in the app (More → Audit log).

## 10. POPIA-aligned controls

| Principle | Implementation |
| --- | --- |
| Consent | Registration and first Google sign-in require privacy-notice acceptance (stored in `consents` with timestamp); missed-call monitoring has its own explicit consent. |
| Minimality / purpose | Only fields needed for service delivery are collected; contact form collects name, email, phone and the request; missed-call sync sends only number, time and ring duration (no contacts, no recordings). |
| Openness | In-app privacy notice; OS permission rationale strings; permissions requested only at the moment of use. |
| Data-subject participation | Profile correction in-app; “Download a copy of my data”; access/correction/deletion requests handled by the owner (deletion = anonymisation while retaining legally required job, tax and compliance records). |
| Security safeguards | Sections 2–9 above. |
| Retention | Expired tokens and orphan uploads are purged by scheduled tasks; financial/compliance records are retained for statutory periods; anonymisation for closed accounts. |
| Cross-border | Deploy to Azure **South Africa North** (Johannesburg) to keep personal information in-country. |
| Breach response | See §11. |

HYDRA implements controls aligned with POPIA; formal legal sign-off remains the organisation's responsibility.

## 10a. HYDRA Smart Quote (AI) controls

- Server-side role and ownership checks on every AI endpoint (cross-customer → 404; employees only see the AI
  summary of an assigned job, without pricing; owner-only configuration → 403 for office admins).
- Strict request schemas; AI output is never trusted: Zod-validated, DIY/unsafe sentences removed, PII redacted,
  deterministic safety rules can only raise severity, prices come from the server pricing engine.
- Provider input minimisation (names, emails, phones, ID numbers, addresses redacted; no site address);
  provider keys only in the environment / Key Vault, shown in the app as Configured / Not configured, never logged.
- AI photos: same magic-byte validation and private signed URLs as other uploads; per-message and per-case limits.
- `AI_PROVIDER=mock` (simulation) is refused in production; unset defaults to human-only review.
- Every assessment, admin action, knowledge change and policy version is audited. Details: [AI_ASSISTANT.md §14](AI_ASSISTANT.md#14-security--privacy).

## 11. Incident / breach response

1. Contain: disable affected accounts (owner → Staff accounts / customer record), rotate JWT secrets in Key
   Vault (forces every session to re-authenticate), rotate provider keys (Paystack, Twilio, storage).
2. Investigate using the audit log (request IDs correlate with App Service / Application Insights logs).
3. Assess whether personal information was compromised; notify the Information Regulator and affected data
   subjects as soon as reasonably possible (POPIA s22).
4. Restore from PostgreSQL point-in-time backup if data integrity is affected.
5. Record lessons learned and add regression tests.

## 12. Reporting a vulnerability

Report privately to the PSG Electrical IT contact; do not open public issues containing exploit details.
