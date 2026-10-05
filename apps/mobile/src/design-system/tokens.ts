/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Platform, type ViewStyle } from 'react-native';

/**
 * HYDRA design tokens, tuned to the approved high-fidelity wireframes
 * (docs/wireframes/high-fidelity). Components use these — never raw hex values.
 */
export const colors = {
  background: '#0B0F16',
  backgroundDeep: '#05070B',
  surface: '#151A22',
  surfaceElevated: '#1C222C',
  surfaceInset: '#10141B',
  border: '#2A3340',
  borderStrong: '#364252',
  primary: '#2F6BFF',
  primaryBright: '#3D7BFF',
  primaryMuted: 'rgba(47,107,255,0.14)',
  primaryBorder: 'rgba(61,123,255,0.45)',
  secondary: '#B13CFF',
  secondaryBright: '#C77DFF',
  secondaryMuted: 'rgba(177,60,255,0.14)',
  secondaryBorder: 'rgba(177,60,255,0.45)',
  danger: '#E31837',
  dangerBright: '#FF4D63',
  dangerMuted: 'rgba(227,24,55,0.14)',
  success: '#2CCB8C',
  successMuted: 'rgba(44,203,140,0.14)',
  warning: '#F4B740',
  warningMuted: 'rgba(244,183,64,0.14)',
  text: '#F5F7FA',
  textSecondary: '#C9D1DB',
  textMuted: '#9AA5B1',
  textFaint: '#6B7684',
  overlay: 'rgba(5,7,11,0.72)',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 } as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.4 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
  stat: { fontFamily: fonts.monoBold, fontSize: 28, lineHeight: 32 },
} as const;

/**
 * Cross-platform shadows: CSS `boxShadow` on web (react-native-web deprecates `shadow*`),
 * iOS shadow props and Android elevation on native.
 */
function makeShadow(color: string, opacity: number, blur: number, y: number, elevation: number): ViewStyle {
  if (Platform.OS === 'web') return { boxShadow: `0px ${y}px ${blur}px ${hexToRgba(color, opacity)}` };
  return { shadowColor: color, shadowOpacity: opacity, shadowRadius: blur, shadowOffset: { width: 0, height: y }, elevation };
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const shadow = {
  card: makeShadow('#000000', 0.35, 12, 6, 4),
  glow: makeShadow(colors.primary, 0.45, 14, 4, 6),
};

/** Minimum touch target (WCAG / platform guidelines). */
export const HIT = 44;

/**
 * Tappable controls on the web: no text selection and no long-press callout. Without this, a
 * press-and-hold on a control label in a mobile browser selects the word and the browser offers
 * Share / “Send to” (Samsung Internet recognises words such as “WhatsApp”), which looked like the
 * control itself launched sharing. Native platforms never select Pressable text, so this is web-only.
 */
export const noSelect: ViewStyle | null =
  Platform.OS === 'web' ? ({ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as unknown as ViewStyle) : null;
