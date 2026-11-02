/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
import { Image } from 'expo-image';
import { useWindowDimensions } from 'react-native';

const LOCKUP = require('../../assets/images/brand/psg-logo-lockup.png');
/** Width / height of the trimmed lockup asset (1200 × 284). */
const RATIO = 1200 / 284;

/**
 * Full PSG Electrical & Cables lockup (house mark, wordmark and “Innovation driven electrical
 * solutions”), from the owner-supplied recreated logo (2 November 2026). Only used where it can be
 * shown large enough for the tagline to stay legible (welcome and loading screens); compact places such
 * as the header and app icon keep the vector house mark (BrandLogo).
 */
export function LogoLockup({ maxWidth = 320 }: { maxWidth?: number }) {
  const { width: screen } = useWindowDimensions();
  const width = Math.max(240, Math.min(maxWidth, screen - 48));
  return (
    <Image
      source={LOCKUP}
      style={{ width, height: width / RATIO }}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="PSG Electrical & Cables — Innovation driven electrical solutions"
      testID="brand-lockup"
    />
  );
}
