import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cleanExtras, cleanVideoUrl, israelOffset, openHouseFrom, upcomingOpenHouse } from './page-extras.js';

describe('cleanExtras — the agent page options (0047)', () => {
  it('keeps what was turned on and drops false, unknown keys and wrong types', () => {
    assert.deepEqual(cleanExtras({ visit: true, calculator: false, warranty: 'yes', pixel: 'x' }), { visit: true });
    assert.deepEqual(cleanExtras(null), {});
    assert.deepEqual(cleanExtras([true]), {});
  });

  it('keeps an open house of a few hours, never one that ends first or lasts the day', () => {
    const ok = { start: '2026-10-23T10:00:00+03:00', end: '2026-10-23T12:00:00+03:00' };
    assert.deepEqual(cleanExtras({ openHouse: ok }).openHouse, ok);
    assert.equal(cleanExtras({ openHouse: { start: ok.end, end: ok.start } }).openHouse, undefined);
    assert.equal(cleanExtras({ openHouse: { start: '2026-10-23T08:00:00+03:00', end: '2026-10-23T20:00:00+03:00' } }).openHouse, undefined);
    assert.equal(cleanExtras({ openHouse: { start: 'Friday', end: 'Saturday' } }).openHouse, undefined);
  });

  it('names the same keys as the database check (0047, film since 0048)', () => {
    const sql = readFileSync('supabase/migrations/0048_page_film_option.sql', 'utf8');
    for (const key of ['visit', 'calculator', 'warranty', 'openHouse', 'film']) assert.ok(sql.includes(`'${key}'`), key);
    assert.deepEqual(cleanExtras({ film: true, films: true }), { film: true });
  });
});

describe('the open house on the page', () => {
  const extras = { openHouse: { start: '2026-10-23T10:00:00+03:00', end: '2026-10-23T12:00:00+03:00' } };

  it('shows before and during, and is gone once it ends', () => {
    assert.ok(upcomingOpenHouse(extras, Date.parse('2026-10-20T09:00:00Z')));
    assert.ok(upcomingOpenHouse(extras, Date.parse('2026-10-23T08:30:00Z')));
    assert.equal(upcomingOpenHouse(extras, Date.parse('2026-10-23T09:00:01Z')), undefined);
  });

  it('reads the editor date and times as Israel time, summer and winter', () => {
    assert.equal(israelOffset('2026-10-23', '10:00'), '+03:00');
    assert.equal(israelOffset('2026-12-04', '10:00'), '+02:00');
    assert.deepEqual(openHouseFrom('2026-12-04', '10:00', '12:30'), {
      start: '2026-12-04T10:00:00+02:00',
      end: '2026-12-04T12:30:00+02:00',
    });
    assert.equal(openHouseFrom('2026-12-04', '12:00', '10:00'), undefined);
  });
});

describe('cleanVideoUrl — the outbound video link', () => {
  it('keeps YouTube, TikTok and Instagram over https', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc',
      'https://www.tiktok.com/@agent/video/1',
      'https://vm.tiktok.com/xyz/',
      'https://www.instagram.com/reel/abc/',
    ]) {
      assert.ok(cleanVideoUrl(url), url);
    }
  });

  it('refuses any other host, http, a look-alike, or credentials', () => {
    for (const url of [
      'http://youtube.com/watch?v=abc',
      'https://youtube.com.evil.example/watch',
      'https://evil.example/?u=youtube.com',
      'https://user:pw@youtube.com/',
      'javascript:alert(1)',
      'not a url',
    ]) {
      assert.equal(cleanVideoUrl(url), undefined, url);
    }
  });
});
