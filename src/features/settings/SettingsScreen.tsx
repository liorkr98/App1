import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, View } from 'react-native';

import { useAuth } from '@/core/auth/AuthProvider';
import { deleteAccount } from '@/core/auth/deleteAccount';
import { restorePurchases, useEntitlement } from '@/core/billing';
import { appConfig } from '@/core/config/app';
import { setLanguage, type SupportedLanguage } from '@/core/i18n/i18n';
import { ltr } from '@/core/i18n/format';
import { Button, ListRow, Screen, Sheet, Text, spacing, useTheme } from '@/core/ui';

/**
 * Settings — the store-compliance surface (CLAUDE.md §7).
 *
 * Every section here exists because App Review checks for it. Removing the
 * account-deletion row is an automatic rejection.
 */
export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const { isPro } = useEntitlement();

  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const version = `${Constants.expoConfig?.version ?? '—'} (${
    Platform.OS === 'ios'
      ? (Constants.expoConfig?.ios?.buildNumber ?? '—')
      : String(Constants.expoConfig?.android?.versionCode ?? '—')
  })`;

  const runDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      setConfirmStep(0);
    } catch {
      // Stay on the screen. Signing the user out of an account that still
      // exists would hide the failure from them.
      setDeleteError(t('settings.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const nextLanguage: SupportedLanguage = i18n.language === 'he' ? 'en' : 'he';

  return (
    <Screen scroll flush>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text variant="display">{t('settings.title')}</Text>
      </View>

      <Section title={t('settings.accountSection')}>
        {/* An email address is Latin script inside a Hebrew UI, so it is
            direction-pinned or the bidi algorithm reorders it (§4.4). */}
        <ListRow title={t('settings.email')} value={user?.email ? ltr(user.email) : '—'} />
        <ListRow title={t('settings.signOut')} onPress={() => void signOut()} />
        <ListRow
          title={t('settings.deleteAccount')}
          subtitle={t('settings.deleteAccountSubtitle')}
          destructive
          onPress={() => setConfirmStep(1)}
        />
      </Section>

      <Section title={t('settings.subscriptionSection')}>
        <ListRow
          title={t('settings.subscriptionStatus')}
          value={isPro ? t('settings.subscriptionActive') : t('settings.subscriptionInactive')}
        />
        <ListRow
          title={t('settings.manageSubscription')}
          onPress={() =>
            void Linking.openURL(
              Platform.OS === 'ios'
                ? appConfig.manageSubscriptionUrl.ios
                : appConfig.manageSubscriptionUrl.android,
            )
          }
        />
        {/* Mandatory and must be reachable without a session (§6). */}
        <ListRow title={t('paywall.restore')} onPress={() => void restorePurchases()} />
      </Section>

      <Section title={t('settings.legalSection')}>
        <ListRow
          title={t('paywall.privacyPolicy')}
          onPress={() => void Linking.openURL(appConfig.privacyPolicyUrl)}
        />
        <ListRow
          title={t('paywall.termsOfService')}
          onPress={() => void Linking.openURL(appConfig.termsOfServiceUrl)}
        />
      </Section>

      <Section title={t('settings.supportSection')}>
        <ListRow
          title={t('settings.contactSupport')}
          value={ltr(appConfig.supportEmail)}
          onPress={() => void Linking.openURL(`mailto:${appConfig.supportEmail}`)}
        />
      </Section>

      <Section title={t('language.label')}>
        <ListRow
          title={t('language.label')}
          value={t(`language.${i18n.language === 'he' ? 'he' : 'en'}`)}
          onPress={() => void setLanguage(nextLanguage)}
        />
      </Section>

      <Section title={t('settings.aboutSection')}>
        <ListRow title={t('settings.version')} value={ltr(version)} />
      </Section>

      {/* Two-step confirmation. Deletion is irreversible, so a single tap is
          not enough — CLAUDE.md §7 asks for a clear two-step confirm. */}
      <Sheet
        visible={confirmStep === 1}
        onClose={() => setConfirmStep(0)}
        title={t('settings.deleteConfirmTitle')}
      >
        <Text variant="body">{t('settings.deleteConfirmBody')}</Text>
        <Button
          label={t('settings.deleteConfirmAction')}
          variant="destructive"
          block
          onPress={() => setConfirmStep(2)}
        />
        <Button
          label={t('common.cancel')}
          variant="ghost"
          block
          onPress={() => setConfirmStep(0)}
        />
      </Sheet>

      <Sheet
        visible={confirmStep === 2}
        onClose={() => setConfirmStep(0)}
        title={t('settings.deleteFinalTitle')}
        dismissable={!deleting}
      >
        <Text variant="body">{t('settings.deleteFinalBody')}</Text>
        {deleteError ? (
          <Text variant="caption" color={colors.danger}>
            {deleteError}
          </Text>
        ) : null}
        <Button
          label={t('settings.deleteFinalAction')}
          variant="destructive"
          block
          loading={deleting}
          onPress={() => void runDelete()}
        />
        <Button
          label={t('common.cancel')}
          variant="ghost"
          block
          disabled={deleting}
          onPress={() => setConfirmStep(0)}
        />
      </Sheet>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" muted style={{ paddingHorizontal: spacing.lg }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
