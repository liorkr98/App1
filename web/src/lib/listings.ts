import { factsFromSchema, type Fact, type FactValue, type Listing } from '@/types/listing';
import { propertySchema, vehicleSchema } from '@/features/listings/schemas';

/**
 * Sample listings, with the content of the two reference pages.
 *
 * Stage D replaces this with Supabase. Until then these are what the build
 * renders, and they are real content rather than lorem so the RTL, the
 * gershayim and the fact-grid states are all exercised by the real templates.
 */

/** `null` leaves a fact unanswered; `{ absent: true }` marks it confirmed absent. */
type Answer = FactValue | { absent: true };

function answer(schema: Parameters<typeof factsFromSchema>[0], values: Record<string, Answer>): Fact[] {
  return factsFromSchema(schema).map((fact) => {
    if (!(fact.key in values)) return fact;
    const given = values[fact.key];
    if (given !== null && typeof given === 'object' && 'absent' in given) {
      return { ...fact, present: false };
    }
    return { ...fact, value: given ?? null };
  });
}

const HOST = 'https://placehold.co';

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
    immersive: {
      type: 'tour',
      scenes: ['סלון', 'מטבח', 'חדר הורים', 'חדר ילדים', 'חדר רחצה', 'מרפסת'].map((label, index) => ({
        id: `s${index}`,
        roomKey: `room_${index}`,
        label,
        panoUrl: `${HOST}/6000x3000/E4E0D6/6E6F66?text=+`,
        thumbUrl: `${HOST}/512x256/E4E0D6/6E6F66?text=+`,
      })),
      links: [],
      payloadMb: 8,
    },
  },

  // Street present, so the map section renders.
  location: { city: 'חולון', street: 'סוקולוב 42' },
  seller: { name: 'ליאור', phone: '972500000000', role: 'בעל הדירה' },
  template: 'clean',
  status: 'published',
  publishedAt: '2026-09-07T00:00:00.000Z',
  indexable: false,
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
    immersive: {
      type: 'spin',
      frames: [],
      frameCount: 36,
    },
  },

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
