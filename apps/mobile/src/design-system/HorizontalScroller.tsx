import type { ReactNode } from 'react';
import { Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Horizontal strip (filter chips, card carousels) that sits inside a vertical page ScrollView.
 *
 * Native: a horizontal ScrollView — different axis from the page, handled by the OS gesture system.
 * Web: a plain overflow-x container. A nested react-native-web ScrollView would hold the touch
 * responder after scrolling and refuse the page ScrollView's requests on every scroll event
 * ("ScrollView doesn't take rejection well"); browser-native overflow scrolling avoids the
 * responder negotiation entirely while keeping touch, trackpad and shift+wheel scrolling.
 */
export function HorizontalScroller({
  children,
  contentContainerStyle,
  style,
  snapInterval,
  testID,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Native card carousels: snap to each card (card width + gap). */
  snapInterval?: number;
  testID?: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={[WEB_SCROLL, style]} testID={testID}>
        <View style={[{ flexDirection: 'row', alignSelf: 'flex-start' }, contentContainerStyle]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={contentContainerStyle}
      snapToInterval={snapInterval}
      decelerationRate={snapInterval ? 'fast' : 'normal'}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

// react-native-web passes these CSS properties through; they are not part of the native style types.
const WEB_SCROLL = { overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', overscrollBehaviorX: 'contain' } as unknown as ViewStyle;
