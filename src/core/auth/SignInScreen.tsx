import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ltr } from '@/core/i18n/format';
import { Button, Input, Screen, Text, spacing, useTheme } from '@/core/ui';

import { useAuth } from './AuthProvider';

type Step = 'email' | 'code';

/**
 * Shared sign-in screen.
 *
 * Email OTP is the primary flow — it suits the Israeli market better than a
 * password, and it removes password reset from the support burden entirely.
 *
 * Apple Sign In is shown whenever it is available. App Review requires it on
 * iOS as soon as any other social login is offered (CLAUDE.md §7), which is
 * why it is not optional alongside Google.
 *
 * Lives in core/auth rather than features/ because every app in the portfolio
 * ships the same sign-in.
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { sendEmailCode, verifyEmailCode, signInWithApple, signInWithGoogle, appleSignInAvailable } =
    useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, fallbackKey: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      // Never surface the raw error: it is English, untranslated, and can
      // carry PII into a screenshot (CLAUDE.md §8).
      setError(t(fallbackKey));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: spacing.sm }}>
        <Text variant="display">{t('auth.title')}</Text>
        <Text variant="body" muted>
          {t('auth.subtitle')}
        </Text>
      </View>

      {step === 'email' ? (
        <>
          <Input
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            error={error ?? undefined}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Button
            label={t('auth.sendCode')}
            block
            loading={busy}
            disabled={email.trim().length === 0}
            onPress={() =>
              void run(async () => {
                await sendEmailCode(email.trim());
                setStep('code');
              }, 'errors.invalidEmail')
            }
          />
        </>
      ) : (
        <>
          {/* The address is Latin script inside a Hebrew sentence, so it goes
              through ltr() or the bidi algorithm reorders it (§4.4). */}
          <Text variant="body" muted>
            {t('auth.codeSentTo', { email: ltr(email.trim()) })}
          </Text>
          <Input
            label={t('auth.codeLabel')}
            placeholder={t('auth.codePlaceholder')}
            value={code}
            onChangeText={setCode}
            error={error ?? undefined}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button
            label={t('auth.verify')}
            block
            loading={busy}
            disabled={code.trim().length === 0}
            onPress={() =>
              void run(
                () => verifyEmailCode(email.trim(), code.trim()),
                'errors.invalidCode',
              )
            }
          />
          <Button
            label={t('auth.changeEmail')}
            variant="ghost"
            block
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="caption" muted>
          {t('auth.or')}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      {appleSignInAvailable ? (
        <Button
          label={t('auth.continueWithApple')}
          variant="secondary"
          block
          disabled={busy}
          onPress={() => void run(signInWithApple, 'errors.generic')}
        />
      ) : null}

      <Button
        label={t('auth.continueWithGoogle')}
        variant="secondary"
        block
        disabled={busy}
        onPress={() => void run(signInWithGoogle, 'errors.generic')}
      />
    </Screen>
  );
}
