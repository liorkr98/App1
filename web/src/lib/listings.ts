import {
  factsFromSchema,
  type CategorySchema,
  type Fact,
  type FactValue,
  type Listing,
  type Provenance,
  type PropertyEnrichment,
  type VehicleEnrichment,
} from '@/types/listing';
import { propertySchema, vehicleSchema } from '@/features/listings/schemas';

/**
 * Sample listings, with the content of the two reference pages.
 *
 * Stage E replaces this with Supabase. Until then these are what the build
 * renders, and they are real content rather than lorem so the RTL, the
 * gershayim and the fact-grid states are all exercised by the real templates.
 */

/** `null` leaves a fact unanswered; `{ absent: true }` marks it confirmed absent. */
type Answer = FactValue | { absent: true };

/**
 * Builds a category's facts from answers, optionally marking the ones a
 * public register filled.
 *
 * `verifiedBy` stands in for a plate lookup having run. It promotes exactly
 * the facts the SCHEMA says are verifiable and that actually got a value —
 * never a field the seller typed, and never an empty one. Which fields those
 * are is read from the schema rather than listed here, so adding a verifiable
 * field is still a one-file change.
 */
function answer(
  schema: CategorySchema,
  values: Record<string, Answer>,
  verifiedBy?: Provenance,
): Fact[] {
  const verifiable = new Set(
    schema.facts.filter((definition) => definition.source === 'verified').map((d) => d.key),
  );

  return factsFromSchema(schema).map((fact) => {
    const promote = (next: Fact): Fact =>
      verifiedBy && verifiable.has(next.key) && next.value !== null
        ? { ...next, source: 'verified', ...verifiedBy }
        : next;

    if (!(fact.key in values)) return fact;
    const given = values[fact.key];
    if (given !== null && typeof given === 'object' && 'absent' in given) {
      return { ...fact, present: false };
    }
    return promote({ ...fact, value: given ?? null });
  });
}

/**
 * Sample photographs, and where they came from.
 *
 * All seven are CC0 or public domain, taken from Wikimedia Commons. The
 * licence of each was read from the Commons API rather than judged by eye —
 * the fetch script refuses anything else — and every source page is listed in
 * docs/SAMPLE-IMAGES.md.
 *
 * Re-encoded to WebP once, at build-prep time, and committed. Commons serves
 * its thumbnails at roughly q90 with no quality parameter, which put the
 * vehicle hero at 183KB — about 3.7s on Slow 4G against a 2.5s LCP target.
 * At q72 it is 64KB. The pages reference files in this repo and talk to no
 * third party at render time.
 *
 * These are DEMO listings. Nothing here is for sale, and the photographs
 * illustrate a layout rather than a property — which is why PRD §3's ban on
 * generative imagery is not in play: none of this was generated, and none of
 * it claims to be the asset described.
 */
const PHOTO = {
  flatLiving: { url: '/sample/flat-living.webp', width: 900, height: 489 },
  flatLounge: { url: '/sample/flat-lounge.webp', width: 600, height: 450 },
  flatKitchen: { url: '/sample/flat-kitchen.webp', width: 600, height: 338 },
  flatBalcony: { url: '/sample/flat-balcony.webp', width: 600, height: 903 },
  carFront: { url: '/sample/car-front.webp', width: 900, height: 543 },
  carSide: { url: '/sample/car-side.webp', width: 600, height: 312 },
  carRear: { url: '/sample/car-rear.webp', width: 600, height: 347 },
  carAngle: { url: '/sample/car-angle.webp', width: 600, height: 400 },
} as const;


/**
 * Proximity for the sample property.
 *
 * Stands in for what the ingestion writes at publish. Deliberately includes a
 * light rail stop that is NOT the nearest — bus stops are closer — because
 * that is the case the ordering exists to handle.
 */
const propertyEnrichment: PropertyEnrichment = {
  category: 'property',
  transit: [
    { id: 't1', name: 'וולפסון', mode: 'light_rail', routes: ['הקו הסגול'], walkMinutes: 7, ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { id: 't2', name: 'סוקולוב/ההסתדרות', mode: 'bus', routes: ['3', '5', '89'], walkMinutes: 3, ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { id: 't3', name: 'תחנת רכבת חולון', mode: 'train', routes: ['רכבת ישראל'], walkMinutes: 18, ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { id: 't4', name: 'ההסתדרות/אילת', mode: 'bus', routes: ['1', '12'], walkMinutes: 5, ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { id: 't5', name: 'קניון חולון', mode: 'bus', routes: ['3', '54'], walkMinutes: 9, ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
  ],
  schools: [
    { id: 's1', name: 'בית ספר יסודי אלונים', type: 'בית ספר יסודי', stream: 'ממלכתי', gradeSpan: 'א׳–ו׳', walkMinutes: 6, ...{ sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } },
    { id: 's2', name: 'גן ילדים רימון', type: 'גן ילדים', stream: 'ממלכתי', walkMinutes: 4, ...{ sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } },
    { id: 's3', name: 'חטיבת ביניים קריית שרת', type: 'חטיבת ביניים', stream: 'ממלכתי', gradeSpan: 'ז׳–ט׳', walkMinutes: 11, ...{ sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } },
    { id: 's4', name: 'תיכון עירוני א׳', type: 'תיכון', stream: 'ממלכתי', walkMinutes: 16, ...{ sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } },
  ],
  places: [
    { id: 'p1', name: 'שופרסל שלי', category: 'grocery', walkMinutes: 5, ...{ sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' } },
    { id: 'p2', name: 'סופר פארם', category: 'pharmacy', walkMinutes: 8, ...{ sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' } },
    { id: 'p3', name: 'פארק פרס', category: 'park', walkMinutes: 9, ...{ sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' } },
    { id: 'p4', name: 'קפה גרג', category: 'cafe', walkMinutes: 6, ...{ sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' } },
    { id: 'p5', name: 'מסעדת הדרים', category: 'restaurant', walkMinutes: 11, ...{ sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' } },
  ],
  summary: {
    restaurantsWithin500m: 7,
    nearestGrocery: { name: 'שופרסל שלי', walkMinutes: 5 },
    nearestPark: { name: 'פארק פרס', walkMinutes: 9 },
  },
  // Carried by the data, so a page with no OSM places carries no OSM credit.
  attributions: ['© מפתחי OpenStreetMap, ברישיון ODbL'],
};

export const propertyListing: Listing = {
  id: 'sample-property',
  slug: 'A7K2M',
  category: 'property',

  title: 'דירת 4 חדרים,\nמשופצת מהיסוד',
  description:
    'הדירה עברה שיפוץ מלא לפני שנתיים — חשמל, אינסטלציה, מטבח וריצוף. הסלון פונה למרפסת שמש דרומית שמקבלת אור מהבוקר עד אחר הצהריים. שלושה חדרי שינה, אחד מהם עם יציאה נפרדת למרפסת שירות.\n\nהבניין שקט, שמונה דיירים בלבד, ועד בית פעיל. חניה בטאבו. בית ספר וגן ילדים במרחק הליכה, ותחנת הרכבת הקלה שבע דקות ברגל.',
  price: 1850000,
  currency: 'ILS',
  priceNote: 'פינוי גמיש',

  facts: answer(propertySchema, {
    rooms: 4,
    area_sqm: 95,
    floor: 3,
    total_floors: 5,
    elevator: true,
    parking: true,
    shelter: true,
    balcony_sqm: 12,
    aspect: 'דרום־מזרח',
    // Confirmed absent — renders greyed showing אין, rather than vanishing.
    storage: { absent: true },
    // Everything below is simply unanswered, so no cell appears at all.
  }),

  media: {
    cover: {
      id: 'p-cover',
      ...PHOTO.flatLiving,
      alt: 'מבט לסלון ולמרפסת השמש',
    },
    gallery: [
      { id: 'p1', ...PHOTO.flatLounge, alt: 'סלון עם ספה ושולחן', caption: 'סלון' },
      { id: 'p2', ...PHOTO.flatKitchen, alt: 'מטבח עם משטח עבודה', caption: 'מטבח משופץ' },
      { id: 'p3', ...PHOTO.flatBalcony, alt: 'מרפסות בחזית הבניין', caption: 'מרפסת דרומית' },
    ],
  },

  enrichment: propertyEnrichment,

  // Street present, so the map section renders.
  location: { city: 'חולון', street: 'סוקולוב 42' },
  seller: { name: 'ליאור', phone: '972500000000', role: 'בעל הדירה' },
  template: 'editorial',
  status: 'published',
  publishedAt: '2026-09-07T00:00:00.000Z',
  indexable: false,
};


/**
 * Vehicle enrichment: what the registers hold, and nothing the seller said.
 *
 * No proximity — a car has no fixed location, and pinning one to an address is
 * the theft risk the design already refuses (RESEARCH.md §4.6).
 */
const vehicleEnrichment: VehicleEnrichment = {
  category: 'vehicle',
  verifiedSpecKeys: ['make', 'model', 'year', 'engine_cc', 'fuel', 'hand', 'previous_ownership', 'test_until'],
  ownershipHistory: [
    { type: 'פרטית', fromMonth: '2019-08', ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { type: 'פרטית', fromMonth: '2014-02', toMonth: '2019-08', ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { type: 'ליסינג', fromMonth: '2009-06', toMonth: '2014-02', ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
  ],
  testValidUntil: '2027-03',
  specSource: { sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' },
  testSource: { sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' },
};

export const vehicleListing: Listing = {
  id: 'sample-vehicle',
  slug: 'V3M9Q',
  category: 'vehicle',

  title: 'מאזדה 3, 2009\nיד שלישית, טסט לשנה',
  description:
    'הרכב אצלי משבע שנים, כל הטיפולים במוסך מורשה ויש תיק טיפולים מלא. שימוש עירוני בעיקר, לא נגרר ולא היה מעורב בתאונה.\n\nמזגן עובד טוב, חיישני רוורס וגג נפתח. צמיגים הוחלפו לפני כ־8,000 ק״מ ומצבר חדש מהקיץ.',
  price: 29000,
  currency: 'ILS',
  // Presence of a book price is what selects the comparison note.
  listPrice: 32000,

  facts: answer(vehicleSchema, {
    make: 'מאזדה',
    model: '3',
    year: 2009,
    hand: 'שלישית',
    mileage: 214000,
    gearbox: 'אוטומטית',
    engine_cc: 1600,
    fuel: 'בנזין',
    color: 'לבן',
    // Stored as the display form. Sellers know the month and year of a טסט,
    // not a day, and inventing one would be a fact we made up.
    test_until: '03/2027',
    previous_ownership: 'פרטית',
    condition: 'טוב',
  }, {
    // Eight of the twelve vehicle fields come back from a plate lookup. The
    // page must let a reader see at a glance which four did not.
    sourceName: 'משרד התחבורה',
    sourceDate: '08/2026',
  }),

  disclosures: [
    'שריטה בדלת נהג אחורית, כ־10 ס״מ',
    'שפשוף קל בפגוש אחורי מחניה',
    'בלמים קדמיים יצטרכו החלפה בטיפול הבא',
  ],

  media: {
    cover: {
      id: 'v-cover',
      ...PHOTO.carFront,
      alt: 'מאזדה 3 בזווית קדמית',
    },
    gallery: [
      { id: 'v1', ...PHOTO.carSide, alt: 'הרכב מהצד', caption: 'צד ימין' },
      { id: 'v2', ...PHOTO.carRear, alt: 'הרכב מאחור', caption: 'חזית אחורית' },
      { id: 'v3', ...PHOTO.carAngle, alt: 'הרכב משלושת רבעי', caption: 'שלושת רבעי' },
    ],
  },

  enrichment: vehicleEnrichment,

  // City only, no street: a vehicle's location is an approximate meeting
  // area. No street means no map section (DESIGN-CONTRACT §5.4).
  location: { city: 'ראשון לציון' },
  seller: { name: 'ליאור', phone: '972500000000', role: 'בעל הרכב' },
  template: 'editorial',
  status: 'published',
  publishedAt: '2026-09-07T00:00:00.000Z',
  indexable: false,
};

export const listings: Listing[] = [propertyListing, vehicleListing];

export function listingBySlug(slug: string): Listing | undefined {
  return listings.find((listing) => listing.slug === slug);
}
