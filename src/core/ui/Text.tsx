import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { FONT_FAMILY, type FontWeightName } from './fonts';
import { useTheme } from './theme';
import { typeScale, type TypeVariant } from './tokens';

/**
 * The only Text in the codebase (CLAUDE.md §5, §10).
 *
 * Bare react-native Text is banned by an ESLint rule because it carries no
 * font family, no Hebrew line height and no direction default — Hebrew then
 * renders in the Android system font, which looks broken.
 *
 * This file is the one place allowed to import react-native's Text.
 */

const VARIANT_WEIGHT: Record<TypeVariant, FontWeightName> = {
  display: 'bold',
  title: 'semibold',
  body: 'regular',
  label: 'medium',
  caption: 'regular',
};

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TypeVariant;
  /** Overrides the weight implied by the variant. */
  weight?: FontWeightName;
  /** Any token colour. Defaults to the theme's primary text colour. */
  color?: string;
  /** Centres the text. Use sparingly — Hebrew body copy reads better aligned. */
  centered?: boolean;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  ref?: React.Ref<RNText>;
}

export function Text({
  variant = 'body',
  weight,
  color,
  centered = false,
  muted = false,
  style,
  ref,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  const resolvedColor = color ?? (muted ? colors.textSecondary : colors.text);

  return (
    <RNText
      ref={ref}
      style={[
        {
          fontFamily: FONT_FAMILY[weight ?? VARIANT_WEIGHT[variant]],
          fontSize: typeScale[variant].fontSize,
          lineHeight: typeScale[variant].lineHeight,
          color: resolvedColor,
          // 'auto' follows the text's own direction, so a Hebrew string aligns
          // right and an English one aligns left without any branching.
          textAlign: centered ? 'center' : 'auto',
        },
        style,
      ]}
      {...rest}
    />
  );
}
