# HYDRA Part 3 — Owner-confirmed PSG Details

**Source:** User-provided owner confirmations, 2 November 2026. These corrections supersede earlier open questions in the Part 3 implementation checklist.

## Confirmed company information

- **Brand:** PSG Electrical & Cables.
- **Logo:** A newly recreated reference PNG is supplied as `PSG_Electrical_Cables_Recreated_Logo.png`. It is a recreation, **not** an original vector/logo supplied by the owner. Review final rendering/approval before production release. Use it in a way that stays legible at small mobile sizes; do not compress the full wordmark into an app icon.
- **Email addresses:** Show **both** `info@psgelectrical.co.za` and `trite@polka.co.za` (label the second as solar/Trite Solar as appropriate). Do not silently remove any confirmed email.
- **Phone numbers:** Show **both** `082 603 9283` (Ricky) and `072 752 0848` (Keoran). Keep both callable. Existing primary call button may use `082 603 9283`, but ensure the other number is also easy to find and dial.
- **WhatsApp:** Official number **082 603 9283**. Use a correct South African international-format WhatsApp link, e.g. `https://wa.me/27826039283`, with URL-encoded prefilled message if necessary.
- **Working hours:** **Monday to Friday, 07:00–18:00**. No claim of weekend, after-hours or 24/7 availability; requests may be accepted asynchronously without guaranteeing immediate handling.
- **Experience:** **25+ years** is confirmed and may be presented as company experience; do not infer a founding year without separate confirmation.
- **Client names and logos:** Permission is confirmed to publish portfolio client names and logos (subject to only using the actual assets from the supplied portfolio and not inventing others).
- **Offices:** **No additional offices.** Remove fictional regional offices, manager names, and branch claims. Only display a real registered address/location if independently confirmed.
- **Warranty:** **12-month workmanship warranty** is confirmed. Keep warranty wording precise: workmanship only, with any exclusions/terms as actually agreed; do not imply 12 months on all supplied equipment/materials.

## Implementation directions for Claude Code

1. Read this update together with `HYDRA_PART3_CLIENT_CHANGE_REQUIREMENTS.md` and `docs/PART3_CLIENT_CHANGES.md`.
2. Check the actual repo branch `feature/part3-client-changes` and preserve all 26 already approved Part 3 commits. Make new, meaningful follow-up commit(s); **do not rewrite the approved history** without explicit consent.
3. Search guest, customer, staff, admin and owner-facing pages plus seed data, marketing constants, contact helpers, quotation templates and exports for conflicting details.
4. Display both email addresses and both phone numbers in the public Contact page, with working `mailto:` and `tel:` actions. Make the official WhatsApp number functional. Avoid leaking other fake phone numbers or 24/7 promises.
5. Set the published office hours to **Monday–Friday 07:00–18:00** where applicable. Confirm what the backend persists versus front-end copy; seed-only edits do not automatically update already deployed databases. Do not make destructive production data changes.
6. Allow the 25+ years experience claim, and use client names/logos only where the real provided portfolio supports them. Do not fabricate projects, pictures, statistics or certifications.
7. Retain the confirmed 12-month **workmanship** warranty in relevant quotation text. Keep the quote submission, tracking and payments functioning.
8. Add or update tests covering both visible email addresses, two dialable phone numbers, WhatsApp destination, operating days/hours, and absence of invented office listings and 24/7 claims.
9. Run lint, typecheck, tests, route audit, and relevant builds; report any failures accurately. Verify at least the Contact screen and branding visually.
10. Show changes and request approval **before** committing or pushing. Do not push unless explicitly approved. Preserve the existing Git user identity and accurate AI disclosure; never falsify authorship.

## Items still requiring clarification

- Whether the owner prefers the **recreated** PNG over the original logo asset, and whether its look is approved.
- Which contact number the **primary header button** should dial if different from 082 603 9283.
- Any guaranteed turnaround times or specific quotations/service pricing remain unconfirmed and must not be advertised as facts.
