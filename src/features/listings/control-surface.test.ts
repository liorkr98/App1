import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  locationPrecision,
  ogPriceFragment,
  priceHeadline,
  publicPlace,
  publicStreet,
  showListingMap,
  whatsappPrefill,
  listingShortName,
  visitPrefill,
} from './control-surface.js';
import type { ListingLocation } from '@/types/listing.js';
import { answer, blankFacts } from './fact-entry.js';

const city: ListingLocation = { city: 'חולון' };
const street: ListingLocation = { city: 'חולון', street: 'סוקולוב 12' };
const exact: ListingLocation = { city: 'תל אביב־יפו', street: 'דיזנגוף 99', lat: 32.08, lng: 34.77 };

describe('priceHeadline', () => {
  it('is an exact figure by default', () => {
    assert.deepEqual(priceHeadline(undefined), { showAmount: true });
  });

  it('prefixes a floor price', () => {
    assert.deepEqual(priceHeadline('from'), { showAmount: true, prefix: 'from' });
  });

  it('hides the number when the price is on request', () => {
    assert.deepEqual(priceHeadline('on_request'), { showAmount: false });
  });
});

describe('ogPriceFragment', () => {
  it('omits לפי פנייה amounts from the WhatsApp title', () => {
    assert.equal(ogPriceFragment(41000, 'on_request', '₪41,000', 'החל מ־'), '');
  });

  it('prefixes a floor price', () => {
    assert.equal(ogPriceFragment(62000, 'from', '₪62,000', 'החל מ־'), ' · החל מ־₪62,000');
  });

  it('prints an exact figure', () => {
    assert.equal(ogPriceFragment(1_850_000, undefined, '₪1,850,000', 'החל מ־'), ' · ₪1,850,000');
  });

  it('omits a missing or zero price', () => {
    assert.equal(ogPriceFragment(0, 'exact', '₪0', 'החל מ־'), '');
  });
});

describe('locationPrecision', () => {
  it('infers area, street, and exact from what the row holds', () => {
    assert.equal(locationPrecision(city), 'area');
    assert.equal(locationPrecision(street), 'street');
    assert.equal(locationPrecision(exact), 'exact');
  });

  it('lets an explicit area win even when a street exists', () => {
    assert.equal(locationPrecision({ ...exact, precision: 'area' }), 'area');
    assert.equal(publicPlace({ ...exact, precision: 'area' }), 'תל אביב־יפו');
    assert.equal(showListingMap({ ...exact, precision: 'area' }), false);
  });
});

describe('whatsappPrefill', () => {
  it('keeps the generic line when there is no place', () => {
    assert.equal(whatsappPrefill('property'), 'היי, ראיתי את הדירה ואשמח לפרטים');
  });

  it('puts the public place into the opening line', () => {
    assert.equal(
      whatsappPrefill('property', 'דיזנגוף 99, תל אביב־יפו'),
      'היי, ראיתי את הדירה בדיזנגוף 99, תל אביב־יפו ואשמח לפרטים',
    );
  });
});

describe('the WhatsApp lines name the listing (19 Oct 2026)', () => {
  const car = answer(answer(answer(blankFacts('vehicle'), 'make', 'מאזדה'), 'model', '3'), 'year', 2009);
  const flat = answer(blankFacts('property'), 'rooms', 4);

  it('names a car by make, model and year', () => {
    const name = listingShortName('vehicle', car);
    assert.equal(name, 'מאזדה 3 2009');
    assert.equal(
      whatsappPrefill('vehicle', 'ראשון לציון', name),
      'היי, ראיתי את מאזדה 3 2009 בראשון לציון ואשמח לפרטים',
    );
  });

  it('names a flat by its rooms, and keeps the noun when too little was answered', () => {
    assert.equal(listingShortName('property', flat), 'דירת 4 חדרים');
    assert.equal(listingShortName('property', blankFacts('property')), undefined);
    assert.equal(listingShortName('vehicle', blankFacts('vehicle')), undefined);
  });

  it('asks for a visit to a flat and a test drive of a car', () => {
    assert.equal(visitPrefill('property', 'חיפה', 'דירת 4 חדרים'), 'היי, אשמח לתאם ביקור — דירת 4 חדרים בחיפה');
    assert.equal(visitPrefill('vehicle'), 'היי, אשמח לתאם נסיעת מבחן — הרכב');
  });
});

describe('publicStreet — the street, never the building (7 Oct 2026)', () => {
  it('drops a plain house number', () => {
    assert.equal(publicStreet('הקישון 43'), 'הקישון');
    assert.equal(publicStreet('דיזנגוף 99'), 'דיזנגוף');
  });

  it('drops letters, ranges, slashes and "מס׳"', () => {
    assert.equal(publicStreet('הרצל 5א'), 'הרצל');
    assert.equal(publicStreet('הרצל 5 א'), 'הרצל');
    assert.equal(publicStreet('בן יהודה 43/2'), 'בן יהודה');
    assert.equal(publicStreet('אלנבי 10-12'), 'אלנבי');
    assert.equal(publicStreet("ז'בוטינסקי מס' 7"), "ז'בוטינסקי");
    assert.equal(publicStreet('שד׳ רוטשילד, 12'), 'שד׳ רוטשילד');
  });

  it('keeps a street with no number as typed', () => {
    assert.equal(publicStreet('  שדרות   ירושלים '), 'שדרות ירושלים');
  });

  it('keeps a street whose name is a number', () => {
    assert.equal(publicStreet('רחוב 10'), 'רחוב 10');
  });
});
