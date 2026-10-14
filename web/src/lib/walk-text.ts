import { walkPhrase } from '@/features/listings/hebrew-plural';

import { lang } from './i18n';

/**
 * "7 דקות הליכה" as one string, in the page's language (a map label, an
 * aria-label). Arabic counts 3 to 10 with the plural; English and Russian
 * use the short unit, which has no plural to get wrong.
 */
export function walkText(minutes: number): string {
  const language = lang();
  if (language === 'he') return walkPhrase(minutes);
  if (language === 'ar') return `${minutes} ${minutes >= 3 && minutes <= 10 ? 'دقائق' : 'دقيقة'} مشيًا`;
  if (language === 'ru') return `${minutes} мин пешком`;
  return `${minutes} min walk`;
}
