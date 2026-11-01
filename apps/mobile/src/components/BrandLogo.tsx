/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Software Mansion. 2026. react-native-svg documentation. Available at: https://github.com/software-mansion/react-native-svg [Accessed 1 November 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../design-system';

/**
 * PSG Electrical & Cables house mark (blue → violet → pink), drawn as a vector so it stays sharp at
 * every size. Mirrors `assets/images/brand/psg-logo.svg`, which the app icon and splash are rendered
 * from. Use this wherever the mark stands for the company; functional lightning icons stay icons.
 */
export function BrandLogo({ size = 40, decorative = false }: { size?: number; decorative?: boolean }) {
  const gradientId = `psg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'PSG Electrical & Cables logo'}
      testID="brand-logo"
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="8" x2="0" y2="94" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.brandBlue} />
          <Stop offset="0.5" stopColor={colors.brandViolet} />
          <Stop offset="1" stopColor={colors.brandPink} />
        </LinearGradient>
      </Defs>
      <Path d="M83.5 94V34.2L49.3 14.7L15 34.2V88H49.4V60" fill="none" stroke={`url(#${gradientId})`} strokeWidth={12.2} strokeLinejoin="miter" strokeMiterlimit={4} />
      <Circle cx={49.3} cy={52.4} r={8.9} fill="none" stroke={`url(#${gradientId})`} strokeWidth={8.2} />
    </Svg>
  );
}
