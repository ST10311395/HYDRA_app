/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Owner-confirmed PSG Electrical & Cables contact details (HYDRA_PART3_OWNER_CONFIRMED_DETAILS.md,
 * 2 November 2026). These back every contact action in all four interfaces so a call, email or
 * WhatsApp message never depends on seeded or editable content.
 */
export const PSG_CONTACT = {
  name: 'PSG Electrical & Cables',
  /** Primary business line, dialled by the header call button. */
  primaryPhone: '082 603 9283',
  phones: [
    { label: 'Ricky', number: '082 603 9283' },
    { label: 'Keoran', number: '072 752 0848' },
  ],
  /** Official WhatsApp number (opened as https://wa.me/27826039283). */
  whatsapp: '082 603 9283',
  emails: [
    { label: 'General enquiries', address: 'info@psgelectrical.co.za' },
    { label: 'Solar (Trite Solar)', address: 'trite@polka.co.za' },
  ],
  /** Published office hours. Not a response-time promise; no weekend or after-hours service is offered. */
  hours: 'Monday–Friday, 07:00–18:00',
  hoursShort: 'Mon–Fri 07:00–18:00',
} as const;

/** Owner-confirmed facts that may be presented as such. */
export const PSG_FACTS = {
  experience: '25+ years',
  /** Workmanship only — not supplied equipment or materials. */
  warranty: '12-month workmanship warranty',
  warrantyDetail: 'Our workmanship carries a 12-month warranty. It covers workmanship only, not supplied equipment or materials; any terms are set out in your quotation.',
} as const;
