import type { AreaPlaces, Listing } from '@/types/listing';
import { OSM_ATTRIBUTION } from '@/features/listings/area-note';
import { propertySchema } from '@/features/listings/schemas';

import { golfListing, tlvListing } from './fixtures';
import { answer } from './listing-facts';

/**
 * A listing shaped like the ones agents actually publish (7 Oct 2026).
 *
 * The demo fixtures are generous: verified enrichment, every photo labelled
 * with its room, a floor plan with rooms drawn on it. Real listings from the
 * editor have none of that — no enrichment writer exists, most photos are
 * never labelled, almost nobody uploads a plan — and every template was only
 * ever looked at on the generous version. On a real listing Walk lost its
 * route and Blueprint its plan, and both read as the generic layout.
 *
 * So the template checks render every catalogue template on this one too:
 * street only, no lat/lng, no rooms, no plan, no enrichment — and the
 * neighbourhood exactly as /api/area stores it, with routed walking minutes.
 * `realBareListing` is the same listing before (or without) that lookup.
 *
 * The places are a hand-written sample in the shape OpenStreetMap returns,
 * for the demo only. No real listing reads them.
 */
const origin = { lat: 32.0566, lon: 34.7701 };

export const realAreaPlaces: AreaPlaces = {
  city: 'תל אביב',
  street: 'הקישון',
  origin,
  neighbourhoods: [{ name: 'פלורנטין', lat: 32.0565, lon: 34.7685 }],
  schools: [
    { name: 'בית ספר יסודי בלפור', lat: 32.0581, lon: 34.7712, walkMinutes: 4 },
    { name: 'גן ילדים הקישון', lat: 32.0559, lon: 34.7709, walkMinutes: 2 },
  ],
  transit: [
    { name: 'הקישון/אברבנאל', lat: 32.0571, lon: 34.7694, walkMinutes: 1, mode: 'bus' },
    { name: 'תחנת אליפלט', lat: 32.0553, lon: 34.7664, walkMinutes: 7, mode: 'rail' },
  ],
  parks: [{ name: 'גינת לוינסקי', lat: 32.0577, lon: 34.7735, walkMinutes: 5 }],
  community: [{ name: 'ספריית פלורנטין', lat: 32.0549, lon: 34.7698, walkMinutes: 4 }],
  shops: [{ name: 'שוק לוינסקי', lat: 32.0583, lon: 34.7726, walkMinutes: 4 }],
};

// Without what an editor listing never has.
const { enrichment: _enrichment, ...plain } = tlvListing;
const { room: _room, focalX: _x, focalY: _y, ...cover } = tlvListing.media.cover;

export const realListing: Listing = {
  ...plain,
  id: 'fixture-real',
  slug: 'R4LSH',
  title: 'דירת 2 חדרים\nעם גג בפלורנטין',
  description:
    'למכירה בתל אביב: דירת 2 חדרים בפלורנטין. מדובר בדירה של 60 מ״ר, בקומה 4 מתוך 4, עם מרפסת שמש וכיווני אוויר מערב.\n\nמוזמנים לתאם ביקור ולהתרשם מקרוב.',
  price: 3500000,
  // The facts of the flat in the title — a 2-room roof flat — rather than
  // the 4-room demo it borrows photos from, so the page reads as one listing.
  facts: answer(propertySchema, {
    rooms: 2,
    area_sqm: 60,
    floor: 4,
    total_floors: 4,
    balcony_sqm: 12,
    aspect: 'מערב',
    elevator: { absent: true },
    shelter: true,
    condition: 'שמור',
  }),
  media: {
    // As the editor saves them: no room labels, no plan, no tour.
    cover,
    gallery: tlvListing.media.gallery.map(({ room: _r, caption: _c, ...image }) => image),
  },
  location: { city: 'תל אביב', street: 'הקישון' },
  areaPlaces: realAreaPlaces,
  textAttributions: [OSM_ATTRIBUTION],
};

const { areaPlaces: _places, textAttributions: _credit, ...unplaced } = realListing;

export const realBareListing: Listing = {
  ...unplaced,
  id: 'fixture-real-bare',
  slug: 'R4LB0',
};

/** A car as an agent publishes it: the seller's answers, no register data. */
const { enrichment: _golfRegister, ...golfPlain } = golfListing;

export const realVehicleListing: Listing = {
  ...golfPlain,
  id: 'fixture-real-car',
  slug: 'R4LCR',
};

export const realShapedListings: Listing[] = [realListing, realBareListing, realVehicleListing];
