# HYDRA Part 3 — PSG Electrical & Cables Client Changes and Implementation Brief

**Status:** Client feedback translated into an implementation specification.  
**Date:** 1 November 2026  
**Repository:** https://github.com/ST10311395/HYDRA_app.git  
**Primary website / content source:** https://psg-electrical-site.axiomcompute.workers.dev/  
**Scope:** Existing HYDRA React Native / Expo app, all guest, customer, employee/electrician, administrator and owner experiences where applicable.  
**Priority:** Client requests are mandatory, but retain all existing functional workflows.

> **Claude Code operating instruction:** Read this entire document, inspect the current repository and actual available reference images, create an implementation inventory, and implement in small tested phases. Do not assume file paths or behavior without checking them. Treat this specification as a change request, not an instruction to rewrite the project. If an ambiguous screenshot note could remove existing functionality, implement the smallest clearly supported UI/content change and document the ambiguity instead of deleting capabilities.

## 1. Desired outcome

The PSG Electrical & Cables owner likes the **existing dark / blue / purple colour family**, but the app feels too difficult to navigate. Deliver a cleaner, professional, reliable-looking app that is easier to understand for someone using it for the first time. Redesign login and navigation for **guest, customer, employee and admin** (and preserve owner-only capabilities). Replace inaccurate marketing descriptions with approved information from the PSG website and supplied company portfolio. Remove all 24/7 service, instant emergency-response, and unsupported marketing promises, **without removing useful underlying contact, job, fault-reporting, priority, quoting or scheduling functionality**. Incorporate the client’s specific screen-by-screen annotations.

Do not change working business logic, roles, API contracts, database schema, account permissions, payments, invoice calculations, workflow state machines, data persistence or production configuration unless a demonstrable bug prevents the requested UI changes. Preserve all currently working screens, feature entry points and deep links. Never introduce a broken or dead-end navigation route.

## 2. Source of truth and precedence

1. **Direct client requests and the annotated app screenshots supplied for Part 3** take highest priority regarding requested changes.
2. **PSG's company portfolio screenshots/assets** are the source for official company logo, work examples, sectors and hazardous-environment expertise. Verify exact text and obtain reusable logo artwork; do not treat a low-resolution screenshot as an ideal production logo if better source art exists.
3. **Current PSG website** is the preferred source for public marketing copy, customer contacts, service categories, and opening hours. Consult the live pages and subpages before coding. Website references below are current as of preparation and should be cross-checked.
4. **Existing HYDRA codebase and API** remain the source for what functions exist and how they behave. Preserve them even if visual entry points change.
5. When the website and the portfolio differ, use the more specific client-approved information and flag any material conflict; do not invent facts.

### Verified website facts to reuse

Website headline/brand: **PSG Electrical and Cables**; “Innovation-driven electrical solutions”; “Powering what matters.” Main public scope: electrical engineering and cabling for residential, commercial and industrial customers; solar and backup power through **Trite Solar**. Site lists approximately 25+ years of industry experience (verify before prominently repeating). The public site currently lists:

- **Electrical Installations:** residential installations, commercial fit-outs and industrial electrical work.
- **Fault Finding:** electrical fault diagnosis, testing/verification, and corrective recommendations.
- **Distribution Boards:** new installations, upgrades/replacements, inspection and circuit organisation.
- **Compliance (CoC):** inspections and testing towards compliance with SANS 10142-1, plus documentation.
- **Maintenance & Repairs:** preventative/scheduled maintenance, fault repairs and upgrades.
- **Solar & Backup Power:** panels, inverters and battery backup, associated with Trite Solar.
- **Process:** tell PSG what you need → on-site assessment and clear quotation → safe installation → testing and CoC where required.
- **Hours:** **07:00–18:00** as published. Do **not** equate these with guaranteed response times. Verify days of operation with the owner before stating specific weekdays or weekends.
- **Phone:** **082 603 9283** and **072 752 0848**.
- **Emails shown on site:** **keoran@psgelectrical.co.za** and **keoran@tritesolar.co.za**. Use the appropriate address for its division; verify any older portfolio addresses before overriding.

Website URL: https://psg-electrical-site.axiomcompute.workers.dev/ . Note that the published site itself contains a few phrases like “emergency repairs” or “right now”; the owner's **explicit no-24/7 / no-immediate-response instruction overrides these** in the app. Never infer that the company has 24-hour coverage simply because it accepts fault reports.

### Company portfolio details visible in the supplied references

Portfolio branding includes a **distinctive gradient (blue-to-purple/pink) stylised house/electrical logo**, not the current blue square with white lightning bolt. Portfolio describes industrial/commercial installations, cable management, distribution boards, fault finding, electrical maintenance, solar integration, hazardous-area compliance, and high-demand operating environments. Sectors shown include logistics/warehousing, retail, manufacturing, institutional facilities and chemical/hazardous environments. Portfolio names projects/clients such as African Logistics Services, Swift Chemicals, Fashion Fusion, Hi-Tap Bolt & Tool, and UKZN. **Only display names/logos/photos as real public portfolio items if publication is permitted; avoid invented project images or claims.**

**Important claim control:** Current app visibly claims “ISO 9001 Certified,” “ECA & NSI Accredited,” “Master Electricians,” “33kV Substation Panel Testing,” “LIVE DISPATCH,” “engineer-reviewed quotation within 24 hours,” and “binding technical proposal.” None should be retained as assertions without explicit evidence/owner confirmation. Do not interpret having a purple ISO badge or brochure wording as proof of third-party certification. Retain accurate statements about safety and compliance without claiming certification or accreditation that is unverified.

## 3. Exact client screenshot changes

The original uploaded screenshot files are available in the conversation as references. Keep copies in a **local, untracked reference folder** accessible to Claude Code (for example `part3-reference/`, gitignored if not intended for submission), and match each screenshot by both its filename and its described contents. Claude Code running locally cannot automatically see pictures that were only attached to ChatGPT; copy them into the repository workspace first.

| Reference screenshot | Screen / evidence | Required outcome |
|---|---|---|
| `IMG-20261022-WA0003.jpg` | Logged-in customer dashboard header; client circled the blue lightning logo and the top contact/phone area | Replace the blue lightning logo **across the app** with the owner's official PSG gradient logo. Make the phone icon genuinely initiate a call using the verified business phone number; preserve the login/account control and header responsiveness. |
| `IMG-20261021-WA0010.jpg` | Guest Home, top hero; highlighted “Turnkey high-voltage substations, commercial solar PV plants, industrial cabling, and 24/7 rapid emergency fault ...” plus “24/7 Emergency” button | **Replace the entire turnkey/high-voltage marketing paragraph with concise copy about hazardous-area electrical testing, inspections, and safe fault diagnosis**, grounded in company portfolio. Remove or rename the “24/7 Emergency” CTA; keep an accessible fault/contact action for users. |
| `IMG-20261021-WA0009.jpg` | Guest Home, lower marketing section; circled “GET AN ENGINEER-REVIEWED QUOTATION WITHIN 24 HOURS,” “Launch Multi-Step Quote Tool,” “Contact Engineering Desk,” three extra tiles, and “Track your jobs, quotes & rewards” promo | **Remove the highlighted promotional block/content from the Home page**, including its time guarantee and redundant promotional tiles/promo if they are within the highlighted region. Do **not** delete the actual Quote workflow, contact functionality, account dashboard or rewards. Ensure there remains an easy way to request a quote via a top-level tab/button. |
| `IMG-20261021-WA0012.jpg` | Quote sector picker with “Commercial Infrastructure” description mentioning HVAC, and a separate “Fiber & Data Cabling” sector | Remove inaccurate/unwanted **HVAC** language from the commercial infrastructure sector description and remove the **Fiber & Data Cabling** sector option from the public quotation sector picker, as circled. Preserve the ability to request appropriate electrical/cabling work via valid service categories or description; audit existing records and API enums so previously saved quotes still render. |
| `IMG-20261021-WA0011.jpg` | Quote step 2, Scope: service selector, scope brief, “Standard (24h)” / High Priority / “24/7 Critical,” estimated load (kVA), preferred date | Remove **24-hour and 24/7 urgency promises**. Rename priority choices in neutral language (for example `Standard`, `Priority`, `Urgent fault`) while retaining the underlying priority/triage data mapping. The client also says the “last screenshot” shows content not wanted in quotation: **review this screenshot with the client note in mind, simplify unnecessary overly technical fields where safe**, but DO NOT delete the entire Quote tool or required inputs. At minimum, hide optional `Estimated load (kVA)` from the standard customer path if it is not needed; keep a safe expert/advanced path if downstream engineering depends on it. Preserve date selection where useful. |
| `IMG-20261021-WA0009.jpg` and `IMG-20261021-WA0010.jpg` | Guest Home calls to action and marketing | Avoid duplicate CTAs and long, technical paragraphs; keep concise text in plain language and a simple path to Quote, Services or Contact. |
| Portfolio images `Screenshot 2026-11-01 203150.png`, `203208.png`, `203227.png`, `203241.png`, `203301.png`, `203313.png` | Company profile, logo, services, work examples, quality/compliance, contact information | Use to update genuine branding and business information throughout the app. Crop/extract official logo only if there is no higher-resolution original; do not use whole slide screenshots as logos or claim ownership of unrelated photos. |

**Reference ambiguity guard:** The phrasing “last screenshot we don't need within the quotation section at all” could mean a specific unwanted field/sector rather than every part of a screen. The annotated `Fiber & Data Cabling` sector is a clear deletion; the technical Scope fields need careful review. Do not remove required quote data, all sector choices or the entire quotation feature by guessing.

### Suggested replacement for the hero paragraph (copy can be polished)

“**Hazardous-area electrical testing and inspections, precise fault diagnosis, and dependable electrical maintenance for commercial and industrial facilities. We prioritise safety, compliance and clear recommendations.**”

Ensure claims about hazardous-environment qualifications/testing are consistent with the supplied portfolio and verified with owner if necessary. Do not promise emergency dispatch, 24-hour availability or formal accreditations.

## 4. Login / welcome redesign

- Remove the large/awkward login photograph; replace with a clean, professional branded layout using the proper PSG gradient logo, short headline, restrained abstract lines/shapes and existing colours.
- Clear visual order: official logo and business name → succinct welcome message → Sign in fields → primary Sign In button → Create Account and Continue as Guest pathways.
- Retain password visibility, forgot/reset password, validation, loading/error states, keyboard handling, accessibility, secure authentication, sessions and any existing SSO flows. Do not weaken security or alter token/role routing.
- Match mobile phone dimensions; responsive on narrow Android screens, web and larger screens; avoid overflows and header clipping. Properly support screen readers and system font scaling.
- Do not add unsupported trust badges/awards or unverified numerical claims.

## 5. Navigation and UI — **every role**

**Design language:** Keep dark background and blue as primary action, with subdued purple/pink accent from PSG logo. Improve hierarchy, typography, spacing, icon consistency, tap targets, legibility and helpful empty states. Reduce duplicated actions, multi-level menu hopping, overcrowded dashboards and unnecessary explanatory text. Prefer 4–5 clear primary navigation destinations per role; expose secondary features through a single organised **More / Manage / Account** area with labelled categories and visible search if appropriate. An existing deep link must still reach every feature.

### Guest (not signed in)

- Simple Home, Services, Work/Projects (where real assets exist), Quote, Contact navigation.
- Remove highlighted redundant homepage promo material; use short genuine service overview and clear quote/contact options.
- Visible, functional contact call action; no 24/7 language. Guest can still register or sign in easily.
- Keep browsing and quote intake functioning without unnecessarily forcing account creation (respect existing product rules).

### Customer

- Prioritise `My Jobs`, `Request Service / Quote`, `Quotes to Review`, `Billing / Payments`, `Profile / More` (exact tab architecture determined by audit).
- Clear journey from requesting a service to reviewing a quote, tracking status, accessing CoC, invoice/payment and rewards. Make notifications/status easy to find.
- Keep AI Smart Quote where implemented with clear human-review expectations; do not call a preliminary estimate a binding proposal.
- Preserve customer QR features, rewards, notifications, document access, service history and saved records. Avoid removing function just because its shortcut is moved.

### Employee / Electrician

- Clear Today/Assigned Jobs first; Job details and Check-in/attendance, progress updates, materials, CoC work, timesheets, leave/other staff functions grouped logically.
- Prioritise the daily workflow and large on-site tappable controls; preserve QR, GPS, mobile permissions, job state transitions, offline/refresh behaviour and role limits.
- Make actions discoverable without exposing admin-only data.

### Admin / Office staff

- Clear dashboard with pending jobs/quotes, scheduling & assignment, customers, invoices/payments, inventory and other office work grouped under Manage/More.
- Keep missed calls, reports available to this role, AI review cases, compliance records, discounts, staff/customer support and existing workflows accessible.
- Avoid deeply nested navigation; preserve forms, filters and links.

### Owner (permission superset)

- Preserve owner-only actions: payroll/workforce administration, financial reports/exports, audit, settings, staff account management, policy settings, POPIA/data requests, etc.
- Owner-only functions must remain hidden/blocked for office admins **and protected server-side**. Do not confuse owner with general admin just because the client described four main interfaces.

## 6. Remove misleading 24/7 claims without destroying functionality

Search the full codebase (public and authenticated screens, components, translations, navigation titles, notification templates, quote labels, onboarding, seeded demo strings, metadata and documentation where business copy is asserted) for terms including:

`24/7`, `24-hour`, `24 hours`, `24h`, `around the clock`, `instant response`, `immediate response`, `live dispatch`, `emergency hotline`, `emergency callout`, `within 24 hours`, `critical`, `urgent`, `guaranteed`, `binding proposal`, and equivalent copy.

**Change claims, not the capability:**

- Replace “24/7 Emergency” with **“Report a Fault”** or **“Contact PSG”**, taking the user to the existing fault/service-request flow or verified phone contact.
- Replace “Standard (24h)” with **“Standard”** (no guaranteed turnaround).
- Replace “24/7 Critical” with **“Urgent Fault”** or **“High Priority”** (no guaranteed response).
- Remove “engineer-reviewed quotation within 24 hours”; do not replace it with another unverified deadline.
- Remove or revise “LIVE DISPATCH” if this implies live after-hours staffing; do not disable actual live job-status functionality.
- Keep urgent categories **as data values if existing jobs rely on them**, but change customer-facing language to accurately describe priority without promising 24-hour service.
- Calls/WhatsApp may be initiated from the app at any time, but display **published contact hours 07:00–18:00** where relevant, and do not imply a person always answers. Request submission may remain available outside working hours; acknowledgments must not promise immediate attention.
- Keep actual safety-related fault triage. For immediate danger to life or fire, display neutral safety guidance and direct people to local emergency services; do not imply PSG is itself a public emergency service.
- If the website's wording conflicts with this instruction, **client's latest request wins** for app content.

## 7. Header/logo/call button acceptance criteria

- Replace all usages of generic blue lightning icon as PSG brand mark (login, welcome, headers, about/contact, navigation where the mark is intended) with a legible properly scaled version of the portfolio's blue–purple–pink PSG logo. Preserve separate functional lightning icons when not used as the business logo.
- No distorted, pixelated, cropped or stretched brand mark; use transparent high-resolution/clean vector where legally available.
- Company name should fit without awkward `PSG Elect...` truncation; adapt header widths/condense chrome on compact phones, ensuring other controls remain accessible.
- Call button uses `tel:` via React Native `Linking.openURL` or the existing platform-safe equivalent, with phone number **0826039283** (or owner-confirmed configured primary number), validation and sensible failure handling. If user can choose one of the two listed numbers, label numbers clearly.
- Add a small automated test around the dialer action if the project's testing conventions allow. Never place a fake call button that does nothing.

## 8. Quote flow and service taxonomy

- Keep the underlying multi-step quote workflow operational unless a simplified, equivalent UI can preserve submission and all required validation.
- Update public sector/service names and descriptions to align to real services rather than invented engineering scopes. The website's quick-intake categories are: `New installation`, `Fault or repair`, `DB board`, `Compliance (CoC)`, `Solar & backup`, `Maintenance`.
- Remove the circled **Fiber & Data Cabling** sector from the public picker. Avoid inaccurately asserting that PSG never handles cabling: company portfolio says they do electrical cabling/cable management. Retain a sensible general installation scope where clients can describe it.
- Remove **HVAC electricals** from commercial option wording; don't claim air-conditioning work without explicit approval.
- Remove 24/7 and 24h labels in priority controls; preserve existing back-end enum mappings and historic records.
- Simplify technical questions for non-expert customers; optional kVA field can be in advanced details or omitted from basic intake provided the API accepts it and relevant quote review remains possible.
- Make required fields obvious; preserve location, contact, preferred date and consent as required by the existing submit process.
- Existing quote records created under old categories should still be readable; add compatibility tests instead of deleting enum values from persistence schemas.
- Preserve AI assessment and human technical review where they already exist; do not promise automatic, instant or binding engineering decisions.

## 9. Engineering safety / scope limits

**Absolutely preserve unless there is a directly linked bug requiring a minimal fix:**

- Authentication, JWT/refresh, guest access, onboarding, role landing rules and owner/admin RBAC.
- API endpoints, shared contracts, production database records/migrations, real-time job updates and audit trails.
- Job creation, status, assignment, check-in, GPS, QR, CoC, quote build/review/accept, invoices, payments, stock, payroll, timesheets, rewards, missed-call handling, AI Smart Quote and existing integrations.
- Existing environment variables, secret handling, Azure deployment, external API integrations and EAS configuration; **never print or commit secrets**.
- Existing source code attribution, licence notices, academic references, AI disclosure policy and test evidence.

No unrelated refactoring, dependency upgrades, bulk styling rewrites, mass-renaming or removal of screens. Do not modify or query a production database for testing. Avoid destructive Git operations or force push. Do not silently use the actual live phone number or payment gateway during automated tests.

## 10. Step-by-step implementation and verification

1. Inspect `README.md`, root `package.json`, `apps/mobile`, `apps/api`, `packages/shared`, existing navigation, tests and git status. Verify current branch and uncommitted work. Use a new feature branch unless the user requests otherwise.
2. Inventory **every screen and route per role** and every entry point (tab, shortcut, menu, link and deep link). Capture before screenshots if device available.
3. Compare website content, owner portfolio and supplied screenshot annotations to existing strings. Build a detailed checklist of changed and unchanged flows.
4. Extract/import/optimise legitimate PSG branding, with copyright and quality checks.
5. Design shared style improvements and navigation patterns before editing role screens. Minimise code churn.
6. Implement login, shared header/contact button and guest fixes first; then customer, employee, admin/owner and quote workflow.
7. Search again for inaccurate 24/7/instant-response statements; distinguish forbidden public promises from legitimate technical terms or unrelated software text.
8. Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npx expo-doctor` **where supported by the actual checked-in scripts**, plus targeted new tests. State failures accurately and resolve issues caused by Part 3.
9. Test all role-specific journeys manually where runtime permits; if credentials/environment unavailable, identify **not verified**, don't claim a pass.
10. Provide a final change matrix: screenshot issue → files changed → behavior after → test evidence, plus known limitations, and commit hashes. Keep README/AI disclosure and relevant attribution accurate.

### Regression acceptance checklist

- [ ] Login photograph removed; official logo, usable form, guest/register/sign-in and reset paths work.
- [ ] Blue lightning logo replaced everywhere it stands for PSG company branding.
- [ ] Call action opens the phone dialer with the verified number on Android; web behavior has suitable fallback.
- [ ] The Home “Turnkey high-voltage ... 24/7” paragraph is replaced by accurate hazardous testing messaging.
- [ ] No 24/7 availability, immediate dispatch, fixed 24-hour quote or unsupported certification claims remain in customer-facing copy.
- [ ] Highlighted Home promotional quote block and redundant tiles removed, while functional Quote/Contact entry points remain.
- [ ] Quote picker no longer shows the unwanted Fiber & Data Cabling sector; commercial wording omits HVAC.
- [ ] Urgency/priority selection does not claim 24h/24/7 and still maps correctly to backend.
- [ ] Technical quote fields reduced where safe, without breaking required validation, quote submission or reading old quotes.
- [ ] Guest, customer, employee and admin/owner interfaces more navigable; every original feature remains reachable.
- [ ] Tab bar/header and responsive layouts render correctly on narrow phones; no clipped logo/name, overlaps or keyboard-obscured forms.
- [ ] Customer quote/job/payment/rewards flows still work.
- [ ] Employee jobs, check-in, tracking, timesheets and materials still work.
- [ ] Admin office features and owner-only permissions still work, and admin cannot see owner-only privileged data.
- [ ] Existing tests and builds pass, with the results recorded honestly.

## 11. Proposed 25 meaningful Git commits

**Do not fabricate commit history or split one unchanged file into meaningless commits merely to reach a count.** Use these as a sequencing target, adjusting scope after code inspection. Each commit should correspond to a genuine, reviewable change, with tests as relevant. **Pause for user approval before each `git commit` and before any `git push` unless the user explicitly authorises automatic commits/pushes.**

| # | Suggested commit message | Meaningful deliverable |
|---|---|---|
| 01 | `docs: add Part 3 client feedback and acceptance criteria` | Scope and client change checklist |
| 02 | `test: add baseline navigation and role access checks` | Regression protections |
| 03 | `style: refine shared spacing and typography tokens` | Shared design foundation |
| 04 | `style: polish shared cards buttons and form controls` | Common components |
| 05 | `assets: add approved PSG logo resources` | Correct brand files |
| 06 | `feat: replace PSG brand marks across shared UI` | Logo substitutions |
| 07 | `fix: make header call action open phone dialer` | Functional contact |
| 08 | `fix: improve compact mobile header responsiveness` | Truncation/overflow |
| 09 | `style: redesign sign in and welcome experience` | Photo-free login |
| 10 | `test: cover auth and guest landing routes` | Auth regression |
| 11 | `content: align PSG service copy with official website` | Business content |
| 12 | `content: replace unsupported emergency availability claims` | No 24/7 messaging |
| 13 | `content: update hero with hazardous area testing focus` | Exact hero request |
| 14 | `refactor: remove redundant guest home promotions` | Circled UI block |
| 15 | `style: simplify guest navigation and service discovery` | Guest journey |
| 16 | `style: streamline customer dashboard navigation` | Customer overview |
| 17 | `style: clarify customer job quote and billing pathways` | Customer flow |
| 18 | `style: streamline employee daily work navigation` | Employee flow |
| 19 | `style: simplify admin dashboard and management menus` | Admin flow |
| 20 | `fix: preserve owner-only navigation and access guards` | Owner permissions |
| 21 | `content: correct quotation sector descriptions and options` | HVAC/fibre changes |
| 22 | `refactor: simplify quotation scope and urgency labels` | Quote UX, unchanged data |
| 23 | `test: protect quotation and role workflow regressions` | Workflow tests |
| 24 | `fix: polish responsive screens and accessibility` | Mobile/web QA |
| 25 | `docs: record Part 3 validation and final walkthrough` | Evidence and documentation |

### Git identity and transparency requirements

- Do **not** put `Claude`, `Claude Code`, `Co-Authored-By: Claude`, or an assistant footer in the *human-readable Git commit message* by default. Use clean conventional commit subjects as above.
- Check local `git config user.name` and `git config user.email` before creating commits. **Do not set them to a fabricated human identity**, impersonate another team member, rewrite legitimate authorship, or disable audit logging. A real team member's own Git identity should be configured by that person. If commit signing or repo policy requires attribution, comply.
- **Do not conceal AI usage** where the project's README, assignment or institution requires an AI assistance disclosure. Retain truthful project AI disclosure and citations in the appropriate documentation. Commit author identity is distinct from academic AI-use transparency.
- Don't bulk commit 25 times up front; commit only completed changes and never claim a test passed if it did not.
- Before each push, show `git status`, new commits (`git log --oneline`), target branch and remote; obtain authorisation.

## 12. Work reporting format for Claude Code

After each phase, show:

```
Phase: <number/name>
Client requirement addressed: <screenshot ID or requirement>
Files changed: <actual paths>
What changed: <clear concise description>
Functionality preserved: <specific affected workflows>
Checks run: <commands and honest outcome>
Commit: <hash, if approved and performed>
Remaining issues: <anything unverified>
Next phase: <one next meaningful phase>
```

**Definition of done:** The owner can use any of the main roles without unnecessary menu hunting, public claims match PSG's actual services and hours, the client’s circled requests have been handled, the phone call works, and existing workflows remain usable. All 25 commits must reflect work that really happened; target 20–30 commits, not an arbitrary number at the cost of quality.
