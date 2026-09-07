import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { spacing } from './tokens';

export interface LoadingProps {
  /** Already-translated message. Defaults to common.loading. */
  message?: string;
  /** Fills the available space and centres. */
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Loading({ message, full = true, style }: LoadingProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const label = message ?? t('common.loading');

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[
        {
          flex: full ? 1 : undefined,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.md,
          padding: spacing.xl,
        },
        style,
      ]}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      <Text variant="caption" muted centered>
        {label}
      </Text>
    </View>
  );
}
