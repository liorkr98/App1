import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BEACON_KINDS, EVENT_KINDS, isBeaconKind, isEventKind } from './events.js';

describe('listing event kinds', () => {
  it('accepts the four kinds and nothing else', () => {
    for (const kind of EVENT_KINDS) assert.equal(isEventKind(kind), true);
    for (const bad of ['', 'View', 'click', 'scroll_50', null, 1]) assert.equal(isEventKind(bad), false);
  });

  it('lets the browser report only scroll depth, never views or WhatsApp taps', () => {
    assert.deepEqual([...BEACON_KINDS], ['scroll_75']);
    assert.equal(isBeaconKind('view'), false);
    assert.equal(isBeaconKind('wa'), false);
    assert.equal(isBeaconKind('share'), false);
    assert.equal(isBeaconKind('scroll_75'), true);
  });

  it('matches the kinds migration 0030 allows', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(new URL('../../../supabase/migrations/0030_listing_events_share_scroll.sql', import.meta.url), 'utf8');
    for (const kind of EVENT_KINDS) assert.ok(sql.includes(`'${kind}'`), `migration is missing '${kind}'`);
  });
});
