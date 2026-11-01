/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Verified PSG Electrical & Cables contact details (client brief, Part 3 §2 and §7), taken from the
 * company website and portfolio. These back the always-visible contact actions so a call never
 * depends on seeded or editable content. Open owner questions are tracked in
 * docs/PART3_CLIENT_CHANGES.md (Q1–Q3) — change the values here once the owner confirms.
 */
export const PSG_CONTACT = {
  name: 'PSG Electrical & Cables',
  /** Primary business line, dialled by the header call button. */
  primaryPhone: '082 603 9283',
  phones: [
    { label: 'Main line', number: '082 603 9283' },
    { label: 'Second line', number: '072 752 0848' },
  ],
  email: 'keoran@psgelectrical.co.za',
  solarEmail: 'keoran@tritesolar.co.za',
  /** Published office hours. Not a response-time promise. */
  hours: '07:00–18:00',
} as const;
