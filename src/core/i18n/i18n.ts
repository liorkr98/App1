import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../../../locales/en.json';
import he from '../../../locales/he.json';

/**
 * i18next setup (CLAUDE.md §1, §4.4).
 *
 * Hebrew is the source of truth and the fallback. English is secondary and
 * never the design baseline. A locale we do not recognise resolves to Hebrew,
 * not to English — this is an Israeli-market portfolio, so Hebrew is the
 * safe default, not the exception.
 */

export const SUPPORTED_LANGUAGES = ['he', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'he';

/**
 * Picks the starting language from the device.
 *
 * English only wins when the device explicitly asks for it. Hebrew, anything
 * else, and an unreadable locale all resolve to Hebrew.
 */
export function detectLanguage(): SupportedLanguage {
  try {
    const languageCode = getLocales()[0]?.languageCode;
    return languageCode === 'en' ? 'en' : DEFAULT_LANGUAGE;
  } catch {
    // getLocales can throw if the native module is unavailable (tests, web).
    return DEFAULT_LANGUAGE;
  }
}

void i18next.use(initReactI18next).init({
  resources: {
    he: { translation: he },
    en: { translation: en },
  },
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'translation',
  // React already escapes everything it renders; escaping again would turn
  // Hebrew punctuation and quotes into entities.
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switches language at runtime. Layout direction does not change — see §4.5. */
export async function setLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
}

export default i18next;
