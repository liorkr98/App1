import type { ReactNode } from 'react';
import { Modal, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from './theme';
import { radius, spacing } from './tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Already-translated title. */
  title?: string;
  children: ReactNode;
  /** Blocks dismissal by tapping the backdrop. Use for destructive confirms. */
  dismissable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bottom sheet.
 *
 * Built on the platform Modal rather than a gesture library: the template
 * needs one predictable, accessible presentation, and adding a bottom-sheet
 * dependency for this would need justification under CLAUDE.md §2.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  dismissable = true,
  style,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android's hardware back button must close the sheet, not the screen.
      onRequestClose={dismissable ? onClose : undefined}
    >
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={dismissable ? onClose : undefined}
        style={{ flex: 1, backgroundColor: colors.overlay }}
      />

      <View
        accessibilityViewIsModal
        style={[
          {
            backgroundColor: colors.backgroundElevated,
            borderTopStartRadius: radius.xl,
            borderTopEndRadius: radius.xl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            gap: spacing.lg,
          },
          style,
        ]}
      >
        {/* Grabber. Purely decorative, so it is hidden from screen readers. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: colors.borderStrong,
          }}
        />

        {title ? <Text variant="title">{title}</Text> : null}

        {children}
      </View>
    </Modal>
  );
}
