/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { View } from 'react-native';
import { BrandHeader, Screen } from '../../components/layout';
import { Card, Text, colors, spacing } from '../../design-system';

const SECTIONS: [string, string][] = [
  ['Who we are', 'HYDRA is operated for PSG Electrical and Cables / Trite Solar (South Africa). We process personal information in line with the Protection of Personal Information Act, 2013 (POPIA).'],
  ['What we collect and why', 'Enquiries: name, email, phone and your message — only to respond. Customers: profile, site addresses, job details, quotes, invoices and payment references — to deliver and bill electrical services and issue Certificates of Compliance. Staff: work schedule, timesheets and job check-in time/GPS — for dispatch, payroll and compliance evidence.'],
  ['Location & camera', 'Electricians’ location is captured only at the moment of confirming arrival on site, never in the background. The camera is used only when you scan a QR code or attach a photo.'],
  ['Payments', 'Card payments are processed on the payment gateway’s secure page. HYDRA never stores card numbers or CVV codes.'],
  ['Missed-call follow-up', 'On the office work phone only, and only after explicit consent, the number and time of missed calls are used to send an automatic reply. No contact lists or call content are collected. This feature is not available on iOS.'],
  ['Sharing', 'Information is shared only with service providers needed to run HYDRA (hosting in Microsoft Azure South Africa, payment gateway, SMS/WhatsApp and email providers) under agreements requiring appropriate safeguards.'],
  ['Retention', 'Job, compliance and financial records are kept as required by law (e.g. tax and electrical-compliance record keeping). Enquiries that do not become jobs are deleted or anonymised when no longer needed.'],
  ['Your rights', 'You can view and correct your profile in the app, download a copy of your data, and request deletion. Where deletion is legally permitted, your account is anonymised while statutory records are retained.'],
  ['Security', 'Data is encrypted in transit (TLS) and at rest, passwords are hashed with bcrypt, sessions use short-lived tokens, and sensitive actions are recorded in an audit trail.'],
  ['Contact / breaches', 'Privacy questions or complaints can be sent to the office via the Contact page. Security incidents are handled under our breach-response procedure, including notifying the Information Regulator and affected people where required.'],
];

export default function PrivacyScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Privacy Notice" back />
      <Screen withTabBar={false}>
        <Text variant="h1">Privacy notice</Text>
        <Text variant="bodySmall" color="textMuted">Policy version 2026-09. This notice explains how HYDRA handles personal information.</Text>
        {SECTIONS.map(([t, b]) => (
          <Card key={t} style={{ gap: spacing.sm }}>
            <Text variant="title" weight="bold">{t}</Text>
            <Text variant="bodySmall" color="textSecondary">{b}</Text>
          </Card>
        ))}
        <Text variant="caption" color="textFaint">This notice describes the controls implemented in HYDRA; final legal review remains the responsibility of PSG Electrical and Cables.</Text>
      </Screen>
    </View>
  );
}
