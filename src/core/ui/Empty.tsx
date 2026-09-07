import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { spacing } from './tokens';

export interface EmptyProps {
  /** Already-translated title. Defaults to empty.title. */
  title?: string;
  /** Already-translated description. Defaults to empty.description. */
  description?: string;
  /** Already-translated action label. Rendered only with onAction. */
  actionLabel?: string;
  onAction?: () => void;
  /** An illustration or icon above the title. */
  illustration?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Empty({
  title,
  description,
  actionLabel,
  onAction,
  illustration,
  style,
}: EmptyProps) {
  const { t } = useTranslation();

  return (
    <View
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
      {illustration}

      <Text variant="title" centered>
        {title ?? t('empty.title')}
      </Text>

      <Text variant="body" muted centered>
        {description ?? t('empty.description')}
      </Text>

      {onAction && actionLabel ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}
