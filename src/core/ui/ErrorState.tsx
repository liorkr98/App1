import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from './theme';
import { spacing } from './tokens';

export interface ErrorStateProps {
  /** Already-translated title. Defaults to errors.generic. */
  title?: string;
  /** Already-translated detail line. */
  description?: string;
  onRetry?: () => void;
  /** Already-translated retry label. Defaults to common.retry. */
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Error presentation.
 *
 * Never render a raw exception message here: it is untranslated, it is in
 * English, and it can leak PII into a screenshot (CLAUDE.md §8). Map errors to
 * a key in locales/ and pass the translated string.
 */
export function ErrorState({ title, description, onRetry, retryLabel, style }: ErrorStateProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.md,
          padding: spacing.xl,
        },
        style,
      ]}
    >
      <Text variant="title" color={colors.danger} centered>
        {title ?? t('errors.generic')}
      </Text>

      {description ? (
        <Text variant="body" muted centered>
          {description}
        </Text>
      ) : null}

      {onRetry ? <Button label={retryLabel ?? t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}
