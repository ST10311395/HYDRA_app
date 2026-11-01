/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Software Mansion. 2026. react-native-svg documentation. Available at: https://github.com/software-mansion/react-native-svg [Accessed 1 November 2026].
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../design-system';

const LINES: { d: string; color: string; opacity: number; width: number }[] = [
  { d: 'M-20 60 C 80 10, 180 120, 420 30', color: colors.brandBlue, opacity: 0.35, width: 1.5 },
  { d: 'M-20 95 C 100 40, 220 150, 420 70', color: colors.brandViolet, opacity: 0.3, width: 1.5 },
  { d: 'M-20 130 C 120 80, 240 180, 420 110', color: colors.brandPink, opacity: 0.25, width: 1.5 },
  { d: 'M-20 170 C 140 120, 260 210, 420 150', color: colors.brandViolet, opacity: 0.14, width: 1 },
];

/**
 * Restrained abstract lines in the PSG logo colours, used behind the welcome and sign-in headers in
 * place of a photograph. Purely decorative: hidden from screen readers and never intercepts touches.
 */
export function BrandBackdrop({ height = 220 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="brand-backdrop">
      <Svg width="100%" height={height} viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        {LINES.map((l) => (
          <Path key={l.d} d={l.d} fill="none" stroke={l.color} strokeOpacity={l.opacity} strokeWidth={l.width} />
        ))}
      </Svg>
    </View>
  );
}
