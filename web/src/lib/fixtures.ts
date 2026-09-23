import { propertySchema, vehicleSchema } from '@/features/listings/schemas';
import { groundedAreaDescription } from '@/features/listings/neighborhood-note';
import type { Image, Listing, PropertyEnrichment, VehicleEnrichment } from '@/types/listing';

import { answer } from './listing-facts';

/**
 * P1 fixtures — six realistic listings, on top of the two CI demos.
 *
 * A7K2M and V3M9Q stay in listings.ts unchanged: verify-template-divergences
 * and the JS budget read those two, and a labelled walk on A7K2M would be a
 * fifth <section>. These six exist so later passes can judge a Tel Aviv agent
 * page, a sold Holon stub, a moshav with no enrichment, a plate-lookup hit,
 * a plate miss, and an older car with flaws — not the same apartment in seven
 * palettes.
 *
 * Photographs live in /fixtures with `{base}-{width}.webp` variants. Credits
 * are in docs/CREDITS.md. Nothing here is for sale.
 */

const DIM = {
  'tlv-living': { width: 1200, height: 790 },
  'tlv-kitchen': { width: 1200, height: 800 },
  'tlv-balcony': { width: 1200, height: 674 },
  'tlv-bath': { width: 934, height: 1400 },
  'holon-facade': { width: 1200, height: 900 },
  'holon-balconies': { width: 1200, height: 800 },
  'holon-kitchen': { width: 1200, height: 800 },
  'holon-room': { width: 1200, height: 800 },
  'moshav-house': { width: 900, height: 1200 },
  'moshav-living': { width: 1200, height: 800 },
  'moshav-rooms': { width: 1200, height: 800 },
  'moshav-kitchen': { width: 1200, height: 797 },
  'golf-side': { width: 1200, height: 675 },
  'polo-front': { width: 1200, height: 800 },
  'beetle-side': { width: 1200, height: 675 },
} as const;

type Stem = keyof typeof DIM;

function photo(
  stem: Stem,
  alt: string,
  extra: { caption?: string; room?: Image['room'] } = {},
): Image {
  const size = DIM[stem];
  return {
    id: stem,
    url: `/fixtures/${stem}.webp`,
    width: size.width,
    height: size.height,
    alt,
    variants: true,
    ...extra,
  };
}

const MOT_PROVENANCE = { sourceName: 'משרד התחבורה', sourceDate: '08/2026' } as const;
const EDU = { sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } as const;
const OSM = { sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' } as const;
const OSM_ATTR = '© מפתחי OpenStreetMap, ברישיון ODbL';

const tlvEnrichment: PropertyEnrichment = {
  category: 'property',
  transit: [
    { id: 't1', name: 'דיזנגוף סנטר', mode: 'light_rail', routes: ['הקו האדום'], walkMinutes: 6, ...MOT_PROVENANCE, sourceDate: '2026-09-01' },
    { id: 't2', name: 'דיזנגוף/פרישמן', mode: 'bus', routes: ['5', '72', '405'], walkMinutes: 2, ...MOT_PROVENANCE, sourceDate: '2026-09-01' },
    { id: 't3', name: 'תחנת השלום', mode: 'train', routes: ['רכבת ישראל'], walkMinutes: 14, ...MOT_PROVENANCE, sourceDate: '2026-09-01' },
    { id: 't4', name: 'בן גוריון/דיזנגוף', mode: 'bus', routes: ['9', '22'], walkMinutes: 4, ...MOT_PROVENANCE, sourceDate: '2026-09-01' },
  ],
  schools: [
    { id: 's1', name: 'בית ספר יסודי ארנון', type: 'בית ספר יסודי', stream: 'ממלכתי', gradeSpan: 'א׳–ו׳', walkMinutes: 7, ...EDU },
    { id: 's2', name: 'גן ילדים ניצן', type: 'גן ילדים', stream: 'ממלכתי', walkMinutes: 5, ...EDU },
    { id: 's3', name: 'חטיבת ביניים עירוני ט׳', type: 'חטיבת ביניים', stream: 'ממלכתי', gradeSpan: 'ז׳–ט׳', walkMinutes: 12, ...EDU },
  ],
  places: [
    { id: 'p1', name: 'שופרסל שלי', category: 'grocery', walkMinutes: 4, ...OSM },
    { id: 'p2', name: 'סופר פארם', category: 'pharmacy', walkMinutes: 6, ...OSM },
    { id: 'p3', name: 'גן מאיר', category: 'park', walkMinutes: 8, ...OSM },
    { id: 'p4', name: 'קפה לנדוור', category: 'cafe', walkMinutes: 3, ...OSM },
    { id: 'p5', name: 'מסעדת נזהר', category: 'restaurant', walkMinutes: 5, ...OSM },
  ],
  civic: [
    { id: 'c1', name: 'תחנת דיזנגוף', kind: 'police', walkMinutes: 9, sourceName: 'משטרת ישראל', sourceDate: '2026-09-15' },
    { id: 'c2', name: 'חניון מעלות', kind: 'parking', walkMinutes: 3, sourceName: 'מפ״י', sourceDate: '2026-09-15' },
  ],
  summary: {
    restaurantsWithin500m: 18,
    nearestGrocery: { name: 'שופרסל שלי', walkMinutes: 4 },
    nearestPark: { name: 'גן מאיר', walkMinutes: 8 },
  },
  neighborhoodNote: { text: 'placeholder' },
  attributions: [OSM_ATTR],
};

tlvEnrichment.neighborhoodNote = {
  text: groundedAreaDescription({
    city: 'תל אביב־יפו',
    transit: tlvEnrichment.transit,
    schools: tlvEnrichment.schools,
    places: tlvEnrichment.places,
    civic: tlvEnrichment.civic ?? [],
  }),
};

/** Tel Aviv, full enrichment, 7-digit price, labelled rooms, licensed agent. */
export const tlvListing: Listing = {
  id: 'fixture-tlv',
  slug: 'T4V7A',
  category: 'property',
  title: 'דירת 4 חדרים\nליד דיזנגוף',
  description:
    'דירה משופצת בלב העיר, דקה מדיזנגוף. סלון פתוח למטבח, מרפסת שמש דרומית וממ״ד. ועד בית פעיל, בניין עם מעלית וחניה. מתאימה למגורים, לא להשקעה בלבד.',
  price: 4250000,
  currency: 'ILS',
  priceNote: 'פינוי גמיש',
  facts: answer(propertySchema, {
    rooms: 4,
    area_sqm: 108,
    floor: 5,
    total_floors: 12,
    elevator: true,
    parking: true,
    shelter: true,
    balcony_sqm: 10,
    aspect: 'דרום',
    storage: { absent: true },
    condition: 'משופץ',
    property_tax: 820,
    building_fee: 380,
    entry_date: 'גמיש',
  }),
  media: {
    cover: photo('tlv-living', 'סלון ומטבח פתוחים', { room: 'living' }),
    gallery: [
      photo('tlv-kitchen', 'מטבח עם אריחי משושה', { caption: 'מטבח', room: 'kitchen' }),
      photo('tlv-balcony', 'תריסים ומרפסת בחזית', { caption: 'מרפסת', room: 'balcony' }),
      photo('tlv-bath', 'חדר רחצה', { caption: 'שירותים', room: 'bathroom' }),
    ],
  },
  enrichment: tlvEnrichment,
  location: { city: 'תל אביב־יפו', street: 'דיזנגוף 99', lat: 32.0808, lng: 34.7741 },
  seller: {
    name: 'נועה כהן',
    phone: '972521110001',
    role: 'מתווכת מורשית',
    agencyName: 'כהן נכסים',
    agencyLogoUrl: '/fixtures/agency-mark.svg',
    licenceNumber: '248731',
    licenceVerified: true,
    logoPlacement: 'bar',
  },
  template: 'agency',
  accent: 'forest',
  status: 'published',
  publishedAt: '2026-09-18T00:00:00.000Z',
  indexable: false,
  hyadMark: false,
};

const holonPartial: PropertyEnrichment = {
  category: 'property',
  transit: [
    { id: 'h1', name: 'סוקולוב/ההסתדרות', mode: 'bus', routes: ['3', '89'], walkMinutes: 4, sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' },
  ],
  schools: [],
  places: [
    { id: 'hp1', name: 'יינות ביתן', category: 'grocery', walkMinutes: 8, ...OSM },
  ],
  civic: [],
  summary: {
    nearestGrocery: { name: 'יינות ביתן', walkMinutes: 8 },
  },
  attributions: [OSM_ATTR],
};

/**
 * Holon, partial facts, no street so no map, no room labels, sold.
 *
 * Storage unanswered (omitted), elevator unanswered, only some cells present.
 * Enrichment has no schools and no civic — those groups are omitted, not empty.
 */
export const holonListing: Listing = {
  id: 'fixture-holon',
  slug: 'H2N6P',
  category: 'property',
  title: 'דירת 3 חדרים\nקומה ראשונה',
  description: 'דירה שמורה בחולון, קומה ראשונה בלי מעלית במפרט. המוכר מציין שאין ממ״ד. נמכרה, הפרטים נשארים כתיעוד.',
  price: 1680000,
  currency: 'ILS',
  facts: answer(propertySchema, {
    rooms: 3,
    area_sqm: 76,
    floor: 1,
    parking: true,
    shelter: { absent: true },
    condition: 'שמור',
  }),
  media: {
    cover: photo('holon-facade', 'חזית בניין עם מרפסות'),
    gallery: [
      photo('holon-balconies', 'מרפסות בחזית', { caption: 'חזית' }),
      photo('holon-kitchen', 'מטבח', { caption: 'מטבח' }),
      photo('holon-room', 'חלל פנים', { caption: 'סלון' }),
    ],
  },
  enrichment: holonPartial,
  location: { city: 'חולון' },
  seller: {
    name: 'יוסי לוי',
    phone: '972507770002',
    role: 'בעל הדירה',
  },
  template: 'editorial',
  accent: 'clay',
  status: 'sold',
  publishedAt: '2026-08-02T00:00:00.000Z',
  indexable: false,
  hyadMark: true,
};

/** 300-character agent description — the wrap case linen and brochure have to survive. */
const MOSHAV_DESCRIPTION =
  'בית במושב גן חיים, מוקף גינה ושקט מהכביש. שיפצנו חשמל ואינסטלציה לפני כשנתיים, המטבח חדש והחלונות מוחלפים. ארבעה חדרי שינה, סלון פתוח אל המטבח, ומרפסת קדמית עם צל של עץ ותיק. מתאים למשפחה שרוצה בית עם חצר, בלי בניין ובלי ועד. יש מחסן קטן בחצר ומקום לשני רכבים. הכניסה גמישה אחרי החגים. נשמח לראותכם.';

/** Moshav: long title, ~300-character body, zero enrichment, no transit, no map. */
export const moshavListing: Listing = {
  id: 'fixture-moshav',
  slug: 'M9S3W',
  category: 'property',
  title: 'בית דו־משפחתי עם גינה גדולה במושב גן חיים, ארבעה חדרי שינה ומטבח משופץ',
  description: MOSHAV_DESCRIPTION,
  price: 2890000,
  currency: 'ILS',
  priceNote: 'כולל חצר',
  facts: answer(propertySchema, {
    rooms: 5,
    area_sqm: 142,
    parking: true,
    shelter: true,
    balcony_sqm: 18,
    aspect: 'מערב',
    storage: true,
    condition: 'משופץ',
    property_tax: 410,
    entry_date: 'גמיש',
  }),
  media: {
    cover: photo('moshav-house', 'בית צהוב עם גינה קדמית', { room: 'outdoor' }),
    gallery: [
      photo('moshav-living', 'חלל מגורים', { caption: 'סלון', room: 'living' }),
      photo('moshav-rooms', 'פינת ישיבה', { caption: 'משפחה' }),
      photo('moshav-kitchen', 'מטבח', { caption: 'מטבח', room: 'kitchen' }),
    ],
  },
  location: { city: 'גן חיים' },
  seller: {
    name: 'דנה שמש',
    phone: '972523330003',
    role: 'בעלת הבית',
  },
  template: 'linen',
  accent: 'ochre',
  status: 'published',
  publishedAt: '2026-09-12T00:00:00.000Z',
  indexable: false,
  hyadMark: true,
};

const golfEnrichment: VehicleEnrichment = {
  category: 'vehicle',
  verifiedSpecKeys: ['make', 'model', 'year', 'engine_cc', 'fuel', 'hand', 'previous_ownership', 'test_until'],
  ownershipHistory: [
    { type: 'פרטית', fromMonth: '2021-03', ...MOT_PROVENANCE },
    { type: 'פרטית', fromMonth: '2016-07', toMonth: '2021-03', ...MOT_PROVENANCE },
  ],
  testValidUntil: '2027-06',
  specSource: MOT_PROVENANCE,
  testSource: MOT_PROVENANCE,
};

/** Plate-lookup hit: eight fields verified against the ministry. */
export const golfListing: Listing = {
  id: 'fixture-golf',
  slug: 'G7F2K',
  category: 'vehicle',
  title: 'פולקסווגן גולף, 2016\nיד שנייה, טסט לשנה',
  description:
    'הגולף אצלי מחמש שנים, טיפולים במוסך מורשה, תיק מלא. שימוש משולב עיר־כביש, בלי תאונות. צמיגים מהחורף האחרון.',
  price: 62000,
  currency: 'ILS',
  listPrice: 68000,
  facts: answer(
    vehicleSchema,
    {
      make: 'פולקסווגן',
      model: 'גולף',
      year: 2016,
      hand: 'שנייה',
      mileage: 128000,
      gearbox: 'אוטומטית',
      engine_cc: 1400,
      fuel: 'בנזין',
      color: 'לבן',
      test_until: '06/2027',
      previous_ownership: 'פרטית',
      condition: 'טוב',
    },
    MOT_PROVENANCE,
  ),
  media: {
    cover: photo('golf-side', 'פולקסווגן גולף לבן מהצד'),
    gallery: [],
  },
  enrichment: golfEnrichment,
  location: { city: 'רמת גן' },
  seller: {
    name: 'אמיר חדד',
    phone: '972544440004',
    role: 'בעל הרכב',
  },
  template: 'editorial',
  accent: 'olive',
  status: 'published',
  publishedAt: '2026-09-10T00:00:00.000Z',
  indexable: false,
  hyadMark: true,
};

/**
 * Plate lookup missed. Every fact is לפי המוכר. No enrichment block.
 */
export const poloListing: Listing = {
  id: 'fixture-polo',
  slug: 'P5X1R',
  category: 'vehicle',
  title: 'פולקסווגן פולו, 2017\nיד שלישית',
  description: 'הלוח לא החזיר רשומה, אז כל המספרים כאן לפי המוכר. הרכב אצלי שנתיים, טסט בתוקף, שמור.',
  price: 41000,
  currency: 'ILS',
  facts: answer(vehicleSchema, {
    make: 'פולקסווגן',
    model: 'פולו',
    year: 2017,
    hand: 'שלישית',
    mileage: 156000,
    gearbox: 'אוטומטית',
    engine_cc: 1200,
    fuel: 'בנזין',
    color: 'כחול',
    test_until: '11/2026',
    previous_ownership: 'ליסינג',
    condition: 'טוב',
  }),
  media: {
    cover: photo('polo-front', 'פולקסווגן פולו כחול, לוחית מכוסה'),
    gallery: [],
  },
  location: { city: 'פתח תקווה' },
  seller: {
    name: 'מיכל בר',
    phone: '972505550005',
    role: 'בעלת הרכב',
  },
  template: 'brochure',
  accent: 'charcoal',
  status: 'published',
  publishedAt: '2026-09-14T00:00:00.000Z',
  indexable: false,
  hyadMark: true,
};

/** Older car with flaws. No register payload — the point is section.flaws. */
export const beetleListing: Listing = {
  id: 'fixture-beetle',
  slug: 'B3T8D',
  category: 'vehicle',
  title: 'פולקסווגן חיפושית, 1974\nיד חמישית ומעלה',
  description:
    'חיפושית לשימוש סוף שבוע, לא יומיום. חלודה נקודתית, מנוע אחרי שיפוץ חלקי. מי שמחפש חדשה — לא זו.',
  price: 18500,
  currency: 'ILS',
  facts: answer(vehicleSchema, {
    make: 'פולקסווגן',
    model: 'חיפושית',
    year: 1974,
    hand: 'חמישית ומעלה',
    mileage: 98000,
    gearbox: 'ידנית',
    engine_cc: 1600,
    fuel: 'בנזין',
    color: 'כתום',
    test_until: '02/2027',
    previous_ownership: 'פרטית',
    condition: 'דורש טיפול',
  }),
  disclosures: [
    'חלודה בדלת הנהג ובכף האחורית',
    'צבע מקורי עם תיקונים ישנים',
    'מערכת חשמל חלקית, אין מזגן',
    'צמיגים לשימוש קרוב, לא לנסיעה ארוכה',
  ],
  media: {
    cover: photo('beetle-side', 'חיפושית כתומה ישנה מהצד'),
    gallery: [],
  },
  location: { city: 'יפו' },
  seller: {
    name: 'רועי מזרחי',
    phone: '972526660006',
    role: 'בעל הרכב',
  },
  template: 'dark',
  accent: 'wine',
  status: 'published',
  publishedAt: '2026-09-05T00:00:00.000Z',
  indexable: false,
  hyadMark: true,
};

export const fixtures: Listing[] = [
  tlvListing,
  holonListing,
  moshavListing,
  golfListing,
  poloListing,
  beetleListing,
];
