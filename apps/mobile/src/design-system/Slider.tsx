/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { colors } from './tokens';

/**
 * Lightweight accessible slider (no native dependency). Supports screen-reader increment/decrement.
 *
 * Gesture ownership: the slider claims the touch only when it starts on the slider (never mid-move,
 * so a page scroll that passes over it is not hijacked). On native it then keeps the gesture so a
 * small vertical wobble doesn't hand the drag to the page ScrollView. On web the browser's own
 * panning is disabled over the track (`touchAction: 'none'`), so the page never starts a competing
 * scroll and the ScrollView is never refused the responder.
 */
export function Slider({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  const [width, setWidth] = useState(1);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const track = (e: GestureResponderEvent) => onChange(clamp(min + (e.nativeEvent.locationX / width) * (max - min)));
  const pct = (value - min) / (max - min);
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? step * 5 : -step * 5)))}
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => Platform.OS === 'web'}
      onResponderGrant={track}
      onResponderMove={track}
      style={[styles.hit, WEB_TOUCH]}
    >
      <View style={[styles.track, styles.passThrough]}>
        <View style={[styles.fill, { width: pct * width }]} />
      </View>
      <View style={[styles.thumb, styles.passThrough, { left: pct * width - 11 }]} />
    </View>
  );
}

// `touchAction` is a react-native-web style (CSS touch-action); native ignores it.
const WEB_TOUCH = (Platform.OS === 'web' ? { touchAction: 'none', cursor: 'pointer' } : null) as ViewStyle | null;

const styles = StyleSheet.create({
  hit: { height: 36, justifyContent: 'center' },
  passThrough: { pointerEvents: 'none' },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceElevated },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  thumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, borderWidth: 3, borderColor: colors.primary },
});
