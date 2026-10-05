/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { colors, type ColorToken } from './tokens';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 18, color = 'text' }: { name: IconName; size?: number; color?: ColorToken }) {
  return <Feather name={name} size={size} color={colors[color]} accessibilityElementsHidden importantForAccessibility="no" />;
}
