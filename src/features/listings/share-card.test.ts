import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import { TEMPLATE_IDS, type Listing } from '../../types/listing.js';
import { cardFamily, cardFor, currentCard, shareCardKey } from './share-card.js';

const LISTING: Listing = {
  id: 'listing-1',
  slug: 'A7K2M',
  category: 'property',
  title: 'דירת 4 חדרים ליד דיזנגוף',
  description: '',
  price: 4250000,
  currency: 'ILS',
  facts: [
    { key: 'rooms', label: 'חדרים', value: 4, type: 'number', present: true, required: false, source: 'seller' },
  ],
  media: { cover: { id: 'c', url: 'https://x.test/cover.webp', width: 1600, height: 1200 }, gallery: [] },
  location: { city: 'תל אביב־יפו', street: 'דיזנגוף 99' },
  seller: { name: 'נועה כהן', phone: '0501234567', agencyName: 'כהן נכסים' },
  template: 'aurora',
  status: 'published',
  indexable: false,
};

describe('cardFamily', () => {
  it('gives every template a card look', () => {
    for (const id of TEMPLATE_IDS) {
      assert.ok(cardFamily(id), id);
    }
  });

  it('keeps the dark templates dark and the round-two signatures their own', () => {
    assert.equal(cardFamily('aurora'), 'night');
    assert.equal(cardFamily('showroom'), 'night');
    assert.equal(cardFamily('blueprint'), 'blueprint');
    assert.equal(cardFamily('dossier'), 'dossier');
    assert.equal(cardFamily('ticket'), 'ticket');
    assert.equal(cardFamily('agency'), 'paper');
  });
});

describe('shareCardKey', () => {
  it('is eight hex characters and stable for the same listing', () => {
    const key = shareCardKey(LISTING);
    assert.match(key, /^[0-9a-f]{8}$/);
    assert.equal(shareCardKey({ ...LISTING }), key);
  });

  it('changes with anything the card prints', () => {
    const key = shareCardKey(LISTING);
    assert.notEqual(shareCardKey({ ...LISTING, price: 3990000 }), key);
    assert.notEqual(shareCardKey({ ...LISTING, priceDisplay: 'on_request' }), key);
    assert.notEqual(shareCardKey({ ...LISTING, title: 'דירת 5 חדרים' }), key);
    assert.notEqual(shareCardKey({ ...LISTING, template: 'poster' }), key);
    assert.notEqual(shareCardKey({ ...LISTING, accent: 'wine' }), key);
    assert.notEqual(
      shareCardKey({ ...LISTING, media: { ...LISTING.media, cover: { ...LISTING.media.cover, url: 'https://x.test/new.webp' } } }),
      key,
    );
    assert.notEqual(
      shareCardKey({ ...LISTING, facts: [{ ...LISTING.facts[0]!, value: 5 }] }),
      key,
    );
    assert.notEqual(shareCardKey({ ...LISTING, seller: { ...LISTING.seller, name: 'אחר' } }), key);
  });
});

describe('cardFor', () => {
  it('reads a stored card and refuses anything else', () => {
    assert.deepEqual(cardFor({ url: 'https://x.test/c.webp', key: '0a1b2c3d' }), {
      url: 'https://x.test/c.webp',
      key: '0a1b2c3d',
    });
    assert.equal(cardFor({ url: 'javascript:x', key: '0a1b2c3d' }), undefined);
    assert.equal(cardFor({ url: 'https://x.test/c.webp', key: 'nope' }), undefined);
    assert.equal(cardFor({ url: 'https://x.test/c.webp' }), undefined);
    assert.equal(cardFor('https://x.test/c.webp'), undefined);
    assert.equal(cardFor(null), undefined);
  });
});

describe('currentCard', () => {
  it('is the card only while it was made for what the listing shows', () => {
    const card = { url: 'https://x.test/card.webp', key: shareCardKey(LISTING) };
    const listing: Listing = { ...LISTING, media: { ...LISTING.media, card } };
    assert.equal(currentCard(listing), card.url);
    // The seller dropped the price after the card was made: never advertise
    // the old figure; the page falls back to the photo until a new card exists.
    assert.equal(currentCard({ ...listing, price: 3990000 }), undefined);
    assert.equal(currentCard(LISTING), undefined);
  });
});

describe('migration 0035', () => {
  const sql = fs.readFileSync(
    new URL('../../../supabase/migrations/0035_card_and_time_to_link.sql', import.meta.url),
    'utf8',
  );

  it('adds render_card and lets only the worker write the card', () => {
    assert.match(sql, /add value if not exists 'render_card'/);
    assert.match(sql, /p_key not in \('storyUrl', 'flyerUrl', 'depth', 'card'\)/);
    assert.match(sql, /revoke all on function public\.attach_media_url\(uuid, text, jsonb\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.attach_media_url\(uuid, text, jsonb\) to service_role;/);
  });

  it('shows an agent only their own timings, and the product figure only to admins', () => {
    assert.match(sql, /listing_time_to_link\s+with \(security_invoker = true\)/);
    assert.match(sql, /where l\.owner_id = \(select auth\.uid\(\)\)/);
    assert.match(sql, /if not public\.is_site_admin\(\) then/);
    assert.match(sql, /revoke all on function public\.admin_time_to_link\(\) from public, anon/);
  });
});
