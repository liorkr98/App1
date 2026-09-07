import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './theme';
import { spacing } from './tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Use for anything taller than the viewport. */
  scroll?: boolean;
  /** Removes the default horizontal padding, for edge-to-edge lists. */
  flush?: boolean;
  /** Skips top safe-area inset, e.g. under a navigation header. */
  ignoreTopInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  ref?: React.Ref<View>;
}

/**
 * Screen container: safe area, keyboard avoidance, optional scrolling.
 *
 * Padding uses only symmetric horizontal values, never Left/Right, so the
 * layout mirrors correctly under RTL without any branching (CLAUDE.md §4.1).
 */
export function Screen({
  children,
  scroll = false,
  flush = false,
  ignoreTopInset = false,
  style,
  contentStyle,
  ref,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: ignoreTopInset ? 0 : insets.top,
    paddingBottom: insets.bottom,
    paddingHorizontal: flush ? 0 : spacing.lg,
  };

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[{ paddingVertical: spacing.lg, gap: spacing.lg }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, gap: spacing.lg }, contentStyle]}>{children}</View>
  );

  return (
    <View ref={ref} style={[{ flex: 1, backgroundColor: colors.background }, padding, style]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // iOS needs padding; on Android the system already resizes the window,
        // and adding padding on top of that double-counts the keyboard.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </View>
  );
}
