import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { MIN_TOUCH_TARGET, radius, spacing } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'medium' | 'large';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Already-translated label. Never pass a raw literal (CLAUDE.md §10). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretches to the container width. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<View>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'medium',
  loading = false,
  block = false,
  disabled = false,
  style,
  ref,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();

  // A loading button is not pressable: a second tap would fire the action
  // twice, which for a purchase or a delete is the expensive kind of bug.
  const isInert = disabled || loading;

  const surface = (pressed: boolean): ViewStyle => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: isInert
            ? colors.primaryDisabled
            : pressed
              ? colors.primaryPressed
              : colors.primary,
        };
      case 'destructive':
        return {
          backgroundColor: isInert
            ? colors.dangerDisabled
            : pressed
              ? colors.dangerPressed
              : colors.danger,
        };
      case 'secondary':
        return {
          backgroundColor: pressed ? colors.backgroundSunken : colors.backgroundElevated,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case 'ghost':
        return {
          backgroundColor: pressed ? colors.backgroundElevated : 'transparent',
        };
    }
  };

  const labelColor = (): string => {
    if (isInert && (variant === 'secondary' || variant === 'ghost')) {
      return colors.textDisabled;
    }
    switch (variant) {
      case 'primary':
      case 'destructive':
        return colors.textInverse;
      case 'secondary':
      case 'ghost':
        return colors.text;
    }
  };

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      accessibilityLabel={label}
      disabled={isInert}
      style={({ pressed }) => [
        {
          // MIN_TOUCH_TARGET is the floor for both dimensions (CLAUDE.md §5).
          minHeight: size === 'large' ? 52 : MIN_TOUCH_TARGET,
          minWidth: MIN_TOUCH_TARGET,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: disabled && !loading ? 0.6 : 1,
        },
        surface(pressed),
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={labelColor()} />
      ) : (
        <Text variant="label" weight="semibold" color={labelColor()} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
