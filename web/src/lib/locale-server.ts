import { AsyncLocalStorage } from 'node:async_hooks';

import ar from '@locales/ar.json';
import en from '@locales/en.json';
import ru from '@locales/ru.json';
import arStrings from '@locales/strings/ar.json';
import enStrings from '@locales/strings/en.json';
import ruStrings from '@locales/strings/ru.json';

import { isPageLang, registerLocales, type Lang, type PageLang } from './i18n';

/**
 * The listing page in English, Russian and Arabic: the server half of
 * lib/i18n.ts (14 Oct 2026).
 *
 * SERVER ONLY. Imported by the middleware, never by a page script, so none
 * of these dictionaries reach a browser bundle (the listing page's whole
 * script budget is 12 KB gz).
 *
 * The language rides on an AsyncLocalStorage, not a module variable: one
 * Worker renders many requests at once, and a Russian page must never lend
 * its language to a Hebrew one rendering beside it. The middleware runs the
 * whole render — body included — inside `withLang`.
 */
const store = new AsyncLocalStorage<Lang>();

/** Strings and keys a translated render asked for and did not find (tests read it). */
export const missingCopy = new Set<string>();

registerLocales(
  {
    en: { keys: en, strings: enStrings },
    ru: { keys: ru, strings: ruStrings },
    ar: { keys: ar, strings: arStrings },
  },
  () => store.getStore() ?? 'he',
  (kind, what) => {
    if (missingCopy.size < 500) missingCopy.add(`${store.getStore() ?? '?'} ${kind} ${what}`);
  },
);

export function withLang<T>(language: Lang, run: () => T): T {
  return store.run(language, run);
}

/** The language a path is rendered in: /a/{slug}/{lang}/ and its CI fixture. */
export function pathLang(path: string): PageLang | undefined {
  const match = /^\/(?:a|template-check)\/[^/]+\/(en|ru|ar)\/?$/.exec(path);
  const found = match?.[1];
  return isPageLang(found) ? found : undefined;
}
