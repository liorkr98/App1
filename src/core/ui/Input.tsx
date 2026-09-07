import { useState } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { FONT_FAMILY } from './fonts';
import { Text } from './Text';
import { useTheme } from './theme';
import { MIN_TOUCH_TARGET, radius, spacing, typeScale } from './tokens';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Already-translated label. */
  label?: string;
  /** Already-translated error. Presence switches the field to its error state. */
  error?: string;
  /** Already-translated helper text, hidden while an error is shown. */
  hint?: string;
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<TextInput>;
}

export function Input({
  label,
  error,
  hint,
  style,
  ref,
  onFocus,
  onBlur,
  editable = true,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {label ? (
        <Text variant="label" muted>
          {label}
        </Text>
      ) : null}

      <TextInput
        ref={ref}
        editable={editable}
        accessibilityLabel={label}
        // Hebrew placeholders must not be washed out — textSecondary keeps
        // them legible where a lighter grey would fail contrast.
        placeholderTextColor={colors.textSecondary}
        // The caret sits at the start of the text, which under RTL is the
        // right edge. Using the theme's primary keeps it visible in both
        // schemes; the platform default is often invisible on dark.
        cursorColor={colors.primary}
        selectionColor={colors.primary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          backgroundColor: editable ? colors.background : colors.backgroundSunken,
          color: editable ? colors.text : colors.textDisabled,
          fontFamily: FONT_FAMILY.regular,
          fontSize: typeScale.body.fontSize,
          // 'auto' lets a Hebrew value align right and a Latin one (an email,
          // a phone number) align left, inside the same field.
          textAlign: 'auto',
        }}
        {...rest}
      />

      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
