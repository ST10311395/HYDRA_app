# Part 3 — PSG client change inventory and acceptance checklist

Working record for the Part 3 client feedback round. The full client brief is
[`HYDRA_PART3_CLIENT_CHANGE_REQUIREMENTS.md`](../HYDRA_PART3_CLIENT_CHANGE_REQUIREMENTS.md); this file maps
it onto the actual code, tracks progress and records anything that still needs owner confirmation.

- **Branch:** `feature/part3-client-changes`, created from `main` @ `2f4900d`.
- **Reference images:** `part3-reference/` (local only, gitignored — the portfolio slides include third-party
  client logos and are not ours to redistribute).
- **Rule of thumb:** change claims and presentation, not capability. Roles, RBAC, API contracts, database
  schema, enums, workflows, payments and integrations stay as they are unless a linked bug blocks a UI change.

## 1. Approved business facts

Sources: PSG website (<https://psg-electrical-site.axiomcompute.workers.dev/>) and the owner's company
portfolio (`part3-reference/Screenshot 2026-11-01 2031*.png`).

| Fact | Value used in the app | Source |
| --- | --- | --- |
| Trading name | PSG Electrical & Cables (solar division: Trite Solar) | Website, portfolio |
| Strapline | Innovation-driven electrical solutions | Website, portfolio cover |
| Primary phone | 082 603 9283 | Website; portfolio lists it as Ricky |
| Second phone | 072 752 0848 | Website; portfolio lists it as Keoran |
| Published hours | 07:00–18:00 (no response-time promise) | Website |
| Services | Electrical installations · Fault finding · Distribution boards · Compliance (CoC, SANS 10142-1) · Maintenance & repairs · Solar & backup power | Website |
| Capability areas | Industrial installations and upgrades · cable management · DB installation/reconfiguration · fault finding and diagnostics · maintenance in operational environments · solar integration support · hazardous-area compliance and installations | Portfolio |
| Sectors | Industrial & manufacturing · retail & commercial · logistics & warehousing · institutional facilities · chemical & hazardous environments | Portfolio |
| Quality statement | Work adheres to SANS 10142 wiring standards, CoC requirements and industry best practice; priorities are safety, compliance and long-term reliability | Portfolio |
| Quote intake categories | New installation · Fault or repair · DB board · Compliance (CoC) · Solar & backup · Maintenance | Website |

### Needs owner confirmation (do not state until confirmed)

| # | Question | Current handling |
| --- | --- | --- |
| Q1 | **Email addresses conflict.** Website: `keoran@psgelectrical.co.za`, `keoran@tritesolar.co.za`. Portfolio: `info@psgelectrical.co.za`, `trite@polka.co.za`. Which are current? | Use the website addresses (newer, client-specified source of public contact data); flag here. |
| Q2 | Which number is the primary business line, and may personal names (Ricky / Keoran) be shown? | 082 603 9283 primary, as the brief specifies; numbers labelled without personal names. |
| Q3 | Days of operation for the 07:00–18:00 hours. | Show the hours only, no weekdays. |
| Q4 | "25+ years" industry experience. | Not displayed prominently until confirmed. |
| Q5 | Permission to show portfolio client names/logos (African Logistics Services, Swift Chemicals, Fashion Fusion, Hi-Tap Bolt & Tool, UKZN). | Not shown as named projects until permission is confirmed. |
| Q6 | Original logo artwork (SVG or high-resolution transparent PNG). | Needed for commit 05; a screenshot crop is not production quality. |
| Q7 | Website address: portfolio says `www.psgelectrical.co.za`, live site is the workers.dev URL. | Use the domain only where the brief allows; flag. |

## 2. Claims to remove or reword

| Claim currently in the app | Where (found in audit) | Replacement |
| --- | --- | --- |
| "24/7 Emergency" CTA, header "Emergency" button, "Emergency: call the 24/7 line" | `components/layout.tsx`, guest home, `marketing.tsx` | "Report a fault" → existing fault/quote flow; header call button dials the verified number |
| "24/7 Hotline Service", "24/7 Operations Hub", "24/7 Hotline" office hours | `home.tsx`, `contact.tsx`, `api/seeds/content.ts` | Published hours 07:00–18:00 |
| "ISO 9001 Certified", "ISO 9001 & OHSAS 18001 Certified", header ISO chip, "Verified ISO 9001" | `home.tsx`, `contact.tsx`, `layout.tsx` | Remove; state SANS 10142 / CoC adherence instead |
| "ECA & NSI Accredited", "Master Electricians", team accreditations | `home.tsx`, `team.tsx` | Remove |
| "33kV Substation Panel Testing", "LIVE DISPATCH", turnkey HV substations | `home.tsx`, `marketing.tsx`, `services.tsx` | Hazardous-area testing / inspection / fault-diagnosis copy |
| "Engineer-reviewed quotation within 24 hours", "binding technical proposal" | guest home promo block | Remove block (quote tab remains) |
| Quote turnaround labels ("< 4 Hours", "Immediate") and "Standard (24h)" / "24/7 Critical" | `quote.tsx`, `contact.tsx` | No turnaround; urgency labels Standard / Priority / Urgent fault (enum values unchanged) |
| Department SLAs ("1-Hour Priority Callback", "Immediate Rapid Dispatch"), invented offices, managers and numbers | `api/seeds/content.ts` | Verified contacts only |
| FAQ promises ("within 4 business hours", "immediate engineer dispatch", "24–48 hours") | `api/seeds/content.ts` | Neutral wording, no deadlines |

Enum values (`JOB_URGENCIES = STANDARD | HIGH | EMERGENCY`, `ServiceCategory` incl. `CABLING`, `SUBSTATIONS`)
are **not** removed: existing jobs, quotes and AI cases reference them. Only customer-facing labels change.

## 3. Screenshot → code mapping

| Screenshot | Requirement | Files | Commit(s) |
| --- | --- | --- | --- |
| `IMG-20261022-WA0003.jpg` | Official logo everywhere; phone icon dials verified number | `components/layout.tsx`, `AuthShell.tsx`, `BootSplash.tsx`, `app/welcome.tsx`, `marketing.tsx`, app icon/splash, `utils/links.ts`, seeds | 05–08 |
| `IMG-20261021-WA0010.jpg` | Replace turnkey/HV/24-7 hero copy; remove "24/7 Emergency" CTA; keep fault/contact action | `(public)/(tabs)/home.tsx`, `components/marketing.tsx` | 12–13 |
| `IMG-20261021-WA0009.jpg` | Remove quote-within-24h promo block, extra tiles and account promo; keep Quote/Contact entry points | `(public)/(tabs)/home.tsx`, `components/marketing.tsx` | 14 |
| `IMG-20261021-WA0012.jpg` | Drop HVAC wording; remove Fibre & Data Cabling sector | `(public)/(tabs)/quote.tsx`, `contact.tsx` | 21 |
| `IMG-20261021-WA0011.jpg` | Neutral urgency labels; hide kVA from standard path; keep date | `(public)/(tabs)/quote.tsx` | 22 |
| Portfolio slides | Genuine branding, services, sectors, quality statement | public screens, `api/seeds/content.ts` | 05, 11 |

**Ambiguity noted:** "the last screenshot we don't need within the quotation section at all" is read as the
technical scope fields on WA0011 (kVA, HV voltage options) and the circled Fibre sector — not the whole quote
tool. Required inputs (service, scope brief, location, contact, consent) and the preferred date stay.

## 4. Screen and route inventory (baseline)

Every file route below must remain reachable after Part 3; `src/__tests__/part3-baseline.test.tsx` fails if
any is removed. Additions are allowed.

| Role | Primary tabs (before) | Secondary screens |
| --- | --- | --- |
| Guest | Home · Services · Work · Quote · Contact | `faq`, `partners`, `privacy`, `team`, `why-psg`, `project/[id]`, `service/[id]`, `welcome`, `login`, `register`, `forgot-password`, `reset-password` |
| Customer | Dashboard · Jobs · Rewards · Billing · Profile | `request`, `job/[id]`, `quote/[id]`, `invoice/[id]`, `report/[id]`, `qr/[id]`, `ai`, `ai/new`, `ai/[id]`, `notifications`, `onboarding` |
| Employee | Today · Calendar · Scan · Timesheet · Profile | `jobs`, `job/[id]`, `inspection/[id]`, `materials/[id]`, `report/[id]`, `leave`, `notifications` |
| Admin (office) | Dashboard · Enquiries · Jobs · Workforce · More | about 40 stack screens reached from More (AI review/knowledge/analytics, new job, schedule, inventory, missed calls, invoices, payroll, discounts, compliance, customers, services, settings, notifications, profile, detail screens) |
| Owner (superset) | as Admin | owner-only: `staff`, `reports`, `exports`, `audit`, `data-requests`, `ai-settings`; owner-only actions inside `payroll` (approve/finalise) and `settings` (edit) |

**Owner protection today:** the mobile `OwnerGate` and the More-menu filter hide owner modules from office
admins. The API enforces `ADMIN_OWNER` on the matching endpoints (covered in `apps/api/tests/security.test.ts`).
Gap noted for commit 20: `OWNER_ONLY_PATHS` in `navigation/guards.ts` does not list `/admin/ai-settings`,
although the screen itself is wrapped in `OwnerGate`.

## 5. Acceptance checklist

- [ ] Login photograph removed; official logo, usable form, guest/register/sign-in and reset paths work.
- [ ] Blue lightning logo replaced everywhere it stands for PSG company branding.
- [ ] Call action opens the phone dialer with the verified number on Android; web has a suitable fallback.
- [ ] The Home "Turnkey high-voltage … 24/7" paragraph is replaced by accurate hazardous-area testing copy.
- [ ] No 24/7 availability, immediate dispatch, fixed 24-hour quote or unsupported certification claims remain in customer-facing copy.
- [ ] Highlighted Home promotional quote block and redundant tiles removed; Quote/Contact entry points remain.
- [ ] Quote picker no longer shows Fiber & Data Cabling; commercial wording omits HVAC.
- [ ] Urgency selection does not claim 24h/24/7 and still maps to `STANDARD | HIGH | EMERGENCY`.
- [ ] Technical quote fields reduced where safe; validation, submission and old quotes still work.
- [ ] Guest, customer, employee and admin/owner interfaces more navigable; every original route still reachable.
- [ ] Narrow-phone header/tab layouts render without clipped logo/name or overlaps.
- [ ] Customer quote/job/payment/rewards flows still work.
- [ ] Employee jobs, check-in, tracking, timesheets and materials still work.
- [ ] Admin office features and owner-only permissions still work; admin cannot see owner-only data.
- [ ] Existing tests and builds pass, with results recorded honestly.

## 6. Progress log

| # | Commit | Status | Checks |
| --- | --- | --- | --- |
| 01 | docs: add Part 3 client feedback and acceptance criteria | done | docs only |
| 02 | test: add baseline navigation and role access checks | pending | |

The README's Generative AI declaration will be updated in commit 25 to record Claude Code assistance for
Part 3; it is not removed or shortened.
