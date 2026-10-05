/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, type ColorToken, type as typeScale } from './tokens';

export type TextVariant = keyof typeof typeScale;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  uppercase?: boolean;
}

const WEIGHT_FONT: Record<NonNullable<AppTextProps['weight']>, string> = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
};

/** Typography primitive. Respects OS font scaling (capped to keep layouts intact). */
export function Text({ variant = 'body', color = 'text', align, weight, uppercase, style, ...rest }: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        typeScale[variant],
        { color: colors[color] },
        align ? { textAlign: align } : null,
        weight ? { fontFamily: WEIGHT_FONT[weight] } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    />
  );
}

/** Technical mono label used for section tags such as “// PERFORMANCE TRACK RECORD”. */
export function Label({ color = 'textMuted', style, ...rest }: Omit<AppTextProps, 'variant'>) {
  return <Text variant="label" color={color} uppercase style={style} {...rest} />;
}
