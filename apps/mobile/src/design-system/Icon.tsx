import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { colors, type ColorToken } from './tokens';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 18, color = 'text' }: { name: IconName; size?: number; color?: ColorToken }) {
  return <Feather name={name} size={size} color={colors[color]} accessibilityElementsHidden importantForAccessibility="no" />;
}
