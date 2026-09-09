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

const HOST = 'https://placehold.co';


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
  ],
  schools: [
    { id: 's1', name: 'בית ספר יסודי אלונים', type: 'בית ספר יסודי', stream: 'ממלכתי', gradeSpan: 'א׳–ו׳', walkMinutes: 6, ...{ sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } },
    { id: 's2', name: 'גן ילדים רימון', type: 'גן ילדים', stream: 'ממלכתי', walkMinutes: 4, ...{ sourceName: 'משרד החינוך', sourceDate: '2026-08-14' } },
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
      url: `${HOST}/900x1125/E4E0D6/6E6F66?text=+`,
      width: 900,
      height: 1125,
      alt: 'מבט לסלון ולמרפסת השמש',
    },
    gallery: [
      { id: 'p1', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'סלון', caption: 'סלון ומרפסת שמש' },
      { id: 'p2', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'מטבח', caption: 'מטבח משופץ' },
      { id: 'p3', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'חדר שינה', caption: 'חדר הורים' },
      { id: 'p4', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'מרפסת', caption: 'מרפסת דרומית' },
    ],
  },

  enrichment: propertyEnrichment,

  // Street present, so the map section renders.
  location: { city: 'חולון', street: 'סוקולוב 42' },
  seller: { name: 'ליאור', phone: '972500000000', role: 'בעל הדירה' },
  template: 'clean',
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
    { type: 'פרטית', fromMonth: '2023-04', ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
    { type: 'ליסינג', fromMonth: '2021-03', toMonth: '2023-04', ...{ sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' } },
  ],
  testValidUntil: '2027-03',
  specSource: { sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' },
  testSource: { sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' },
};

export const vehicleListing: Listing = {
  id: 'sample-vehicle',
  slug: 'V3M9Q',
  category: 'vehicle',

  title: 'מאזדה 3, 2021\nיד ראשונה פרטית',
  description:
    'הרכב אצלי מהיום הראשון, כל הטיפולים במוסך מורשה ויש תיק טיפולים מלא. שימוש עירוני בעיקר, לא נגרר ולא היה מעורב בתאונה.\n\nמולטימדיה מקורית עם Apple CarPlay, חיישני רוורס, בקרת שיוט. צמיגים הוחלפו לפני כ־8,000 ק״מ.',
  price: 89000,
  currency: 'ILS',
  // Presence of a book price is what selects the comparison note.
  listPrice: 94000,

  facts: answer(vehicleSchema, {
    make: 'מאזדה',
    model: '3',
    year: 2021,
    hand: 'ראשונה',
    mileage: 62000,
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
      url: `${HOST}/900x675/E4E0D6/6E6F66?text=+`,
      width: 900,
      height: 675,
      alt: 'מאזדה 3 בזווית קדמית',
    },
    gallery: [
      { id: 'v1', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'חזית', caption: 'חזית' },
      { id: 'v2', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'תא נהג', caption: 'תא נהג' },
      { id: 'v3', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'מד אוץ', caption: 'מד אוץ' },
      { id: 'v4', url: `${HOST}/800x600/E4E0D6/6E6F66?text=+`, width: 800, height: 600, alt: 'תא מטען', caption: 'תא מטען' },
    ],
  },

  enrichment: vehicleEnrichment,

  // City only, no street: a vehicle's location is an approximate meeting
  // area. No street means no map section (DESIGN-CONTRACT §5.4).
  location: { city: 'ראשון לציון' },
  seller: { name: 'ליאור', phone: '972500000000', role: 'בעל הרכב' },
  template: 'clean',
  status: 'published',
  publishedAt: '2026-09-07T00:00:00.000Z',
  indexable: false,
};

export const listings: Listing[] = [propertyListing, vehicleListing];

export function listingBySlug(slug: string): Listing | undefined {
  return listings.find((listing) => listing.slug === slug);
}
