import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { appConfig } from '@/core/config/app';
import { Button, ErrorState, ListRow, Loading, Screen, Text, spacing, useTheme } from '@/core/ui';

import { hasActiveEntitlement } from './entitlement';
import { purchasePackage, restorePurchases } from './purchases';
import { useEntitlement } from './useEntitlement';
import { useOfferings } from './useOfferings';

/**
 * Paywall.
 *
 * Presentation and wiring only. The access decision lives in entitlement.ts.
 *
 * Compliance surface required by CLAUDE.md §7 and checked by App Review:
 *   - price and period, per package, straight from the store
 *   - explicit auto-renewal disclosure and how to cancel
 *   - Restore Purchases, reachable without signing in
 *   - links to Privacy Policy and Terms
 * Removing any of these is a rejection, not a style choice.
 */
export interface PaywallProps {
  /** Called after a purchase or restore that results in access. */
  onEntitled?: () => void;
}

export function Paywall({ onEntitled }: PaywallProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { status, isPro } = useEntitlement();
  const { data: offering, isPending, isError, refetch } = useOfferings();

  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const buy = async (pkg: PurchasesPackage) => {
    setBusyPackage(pkg.identifier);
    setNotice(null);
    try {
      const { customerInfo, cancelled } = await purchasePackage(pkg);
      if (cancelled) return;
      if (hasActiveEntitlement(customerInfo)) {
        onEntitled?.();
      }
    } catch {
      setNotice(t('errors.generic'));
    } finally {
      setBusyPackage(null);
    }
  };

  const restore = async () => {
    setRestoring(true);
    setNotice(null);
    try {
      const customerInfo = await restorePurchases();
      if (hasActiveEntitlement(customerInfo)) {
        setNotice(t('paywall.restored'));
        onEntitled?.();
      } else {
        setNotice(t('paywall.nothingToRestore'));
      }
    } catch {
      setNotice(t('errors.generic'));
    } finally {
      setRestoring(false);
    }
  };

  if (status === 'loading' || isPending) {
    return <Loading />;
  }

  if (isError) {
    return <ErrorState title={t('paywall.noOfferings')} onRetry={() => void refetch()} />;
  }

  const packages = offering?.availablePackages ?? [];

  return (
    <Screen scroll>
      <View style={{ gap: spacing.sm }}>
        <Text variant="display">{t('paywall.title')}</Text>
        <Text variant="body" muted>
          {t('paywall.subtitle')}
        </Text>
      </View>

      {isPro ? (
        <Text variant="body" color={colors.success}>
          {t('paywall.alreadySubscribed')}
        </Text>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <Text variant="body">{t('paywall.feature1')}</Text>
        <Text variant="body">{t('paywall.feature2')}</Text>
        <Text variant="body">{t('paywall.feature3')}</Text>
        <Text variant="body">{t('paywall.feature4')}</Text>
      </View>

      {packages.length === 0 ? (
        <Text variant="body" muted>
          {t('paywall.noOfferings')}
        </Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {packages.map((pkg) => (
            <ListRow
              key={pkg.identifier}
              title={pkg.product.title}
              subtitle={pkg.product.description}
              // priceString is already localised and currency-formatted by the
              // store, so it does NOT go through ils() — the storefront knows
              // the user's currency better than we do.
              value={pkg.product.priceString}
              onPress={() => void buy(pkg)}
              disabled={busyPackage !== null}
            />
          ))}
        </View>
      )}

      {packages[0] ? (
        <Button
          label={t('paywall.subscribe')}
          block
          size="large"
          loading={busyPackage !== null}
          onPress={() => void buy(packages[0])}
        />
      ) : null}

      {/* Mandatory, and must work without a session (CLAUDE.md §6). */}
      <Button
        label={t('paywall.restore')}
        variant="ghost"
        block
        loading={restoring}
        onPress={() => void restore()}
      />

      {notice ? (
        <Text variant="caption" centered muted>
          {notice}
        </Text>
      ) : null}

      {/* Auto-renewal disclosure. App Review checks for this exact content. */}
      <Text variant="caption" muted>
        {t('paywall.terms')}
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' }}>
        <Text
          variant="caption"
          color={colors.primary}
          onPress={() => void Linking.openURL(appConfig.privacyPolicyUrl)}
        >
          {t('paywall.privacyPolicy')}
        </Text>
        <Text
          variant="caption"
          color={colors.primary}
          onPress={() => void Linking.openURL(appConfig.termsOfServiceUrl)}
        >
          {t('paywall.termsOfService')}
        </Text>
      </View>
    </Screen>
  );
}
