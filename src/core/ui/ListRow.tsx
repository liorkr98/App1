import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { MIN_TOUCH_TARGET, spacing } from './tokens';

export interface ListRowProps {
  /** Already-translated title. */
  title: string;
  /** Already-translated subtitle. */
  subtitle?: string;
  /** Already-formatted trailing value — run numbers through @/core/i18n/format. */
  value?: string;
  /** Rendered at the reading start of the row (right under RTL). */
  leading?: ReactNode;
  /** Rendered at the reading end of the row (left under RTL). */
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<View>;
}

/**
 * A single row in a settings or data list.
 *
 * flexDirection is plain 'row'. Under RTL that already reverses, so `leading`
 * lands on the right and `trailing` on the left with no conditional — writing
 * a ternary on isRTL here would double-flip it (CLAUDE.md §4.2).
 */
export function ListRow({
  title,
  subtitle,
  value,
  leading,
  trailing,
  onPress,
  destructive = false,
  disabled = false,
  style,
  ref,
}: ListRowProps) {
  const { colors } = useTheme();

  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="body" color={destructive ? colors.danger : undefined} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" muted numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
    </>
  );

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    opacity: disabled ? 0.5 : 1,
  };

  if (!onPress) {
    return (
      <View ref={ref} style={[rowStyle, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        rowStyle,
        { backgroundColor: pressed ? colors.backgroundElevated : 'transparent' },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}
