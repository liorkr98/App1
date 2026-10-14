import type { Listing, ListingTranslation } from '@/types/listing';

import type { PageLang } from './i18n';

/**
 * The CI fixtures' translations (14 Oct 2026): what an agent would have saved
 * from /mine for the Tel Aviv flat and the Golf, so /template-check/{slug}/{lang}/
 * renders the page in that language the way /a/{slug}/{lang}/ does.
 */
const T4V7A: Record<PageLang, ListingTranslation> = {
  en: {
    title: '4-room apartment\nnear Dizengoff',
    description:
      'A renovated apartment in the heart of the city, a minute from Dizengoff. Living room open to the kitchen, a south-facing sun balcony and a safe room. Active building committee, a building with a lift and parking. Suited to living in, not only to investment.',
    priceNote: 'Flexible move-in date',
    source: 'fixture',
  },
  ru: {
    title: '4-комнатная квартира\nрядом с Дизенгоф',
    description:
      'Отремонтированная квартира в самом центре города, в минуте от Дизенгоф. Гостиная, открытая на кухню, солнечный балкон на юг и защищённая комната (мамад). Активный домовой комитет, дом с лифтом и парковкой. Подходит для жизни, а не только для инвестиций.',
    priceNote: 'Гибкая дата освобождения',
    source: 'fixture',
  },
  ar: {
    title: 'شقة 4 غرف\nقرب ديزنغوف',
    description:
      'شقة مُجدَّدة في قلب المدينة، على بُعد دقيقة من ديزنغوف. صالون مفتوح على المطبخ، شرفة شمسية جنوبية وغرفة محصّنة. لجنة بناية نشطة، بناية مع مصعد وموقف سيارات. مناسبة للسكن، لا للاستثمار فقط.',
    priceNote: 'موعد إخلاء مرن',
    source: 'fixture',
  },
};

const G7F2K: Record<PageLang, ListingTranslation> = {
  en: {
    title: 'Volkswagen Golf, 2016\nSecond owner, test valid for a year',
    description:
      "I've had the Golf for five years, serviced at an authorised garage, full service history. Mixed city and highway driving, no accidents. Tyres from last winter.",
    source: 'fixture',
  },
  ru: {
    title: 'Volkswagen Golf, 2016\nВторой владелец, техосмотр на год',
    description:
      'Гольф у меня пять лет, обслуживание в авторизованном сервисе, полная история. Смешанная езда по городу и трассе, без аварий. Шины с прошлой зимы.',
    source: 'fixture',
  },
  ar: {
    title: 'فولكسفاغن غولف، 2016\nيد ثانية، فحص لسنة',
    description:
      'الغولف عندي منذ خمس سنوات، صيانة في كراج معتمد، ملف كامل. قيادة مختلطة بين المدينة والطريق السريع، بدون حوادث. إطارات من الشتاء الماضي.',
    source: 'fixture',
  },
};

const BY_SLUG: Record<string, Record<PageLang, ListingTranslation>> = { T4V7A, G7F2K };

/** The fixture with its translations attached, or as it was when it has none. */
export function withFixtureTranslations(listing: Listing): Listing {
  const translations = BY_SLUG[listing.slug];
  return translations ? { ...listing, translations } : listing;
}
