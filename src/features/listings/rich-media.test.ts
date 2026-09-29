import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import { cleanPlanRooms, depthFor, SPIN_MIN, spinFrames } from './rich-media.js';

describe('cleanPlanRooms', () => {
  it('keeps rooms inside the plan, rounded', () => {
    assert.deepEqual(cleanPlanRooms([{ room: 'kitchen', x: 10.04, y: 5, w: 30, h: 20.26 }]), [
      { room: 'kitchen', x: 10, y: 5, w: 30, h: 20.3 },
    ]);
  });

  it('drops what is outside, too small, unknown or "other"', () => {
    const out = cleanPlanRooms([
      { room: 'living', x: 80, y: 0, w: 30, h: 10 },
      { room: 'bedroom', x: 0, y: 0, w: 1, h: 10 },
      { room: 'garage', x: 0, y: 0, w: 10, h: 10 },
      { room: 'other', x: 0, y: 0, w: 10, h: 10 },
      { room: 'bathroom', x: '1', y: 0, w: 10, h: 10 },
      null,
    ]);
    assert.deepEqual(out, []);
  });

  it('keeps the last rectangle for a room drawn twice', () => {
    const out = cleanPlanRooms([
      { room: 'living', x: 0, y: 0, w: 10, h: 10 },
      { room: 'living', x: 50, y: 50, w: 20, h: 20 },
    ]);
    assert.deepEqual(out, [{ room: 'living', x: 50, y: 50, w: 20, h: 20 }]);
  });
});

describe('spinFrames', () => {
  it('omits a spin with too few frames', () => {
    assert.deepEqual(spinFrames(Array.from({ length: SPIN_MIN - 1 }, (_, i) => i)), []);
    assert.equal(spinFrames(Array.from({ length: 50 }, (_, i) => i)).length, 36);
  });
});

describe('depthFor', () => {
  it('only for the cover it was made from', () => {
    const depth = { url: 'https://x.test/d.webp', cover: 'https://x.test/c.webp' };
    assert.equal(depthFor(depth, 'https://x.test/c.webp'), 'https://x.test/d.webp');
    assert.equal(depthFor(depth, 'https://x.test/new-cover.webp'), undefined);
    assert.equal(depthFor({ url: 'javascript:x', cover: 'c' }, 'c'), undefined);
  });
});

describe('migration 0034', () => {
  const sql = fs.readFileSync(new URL('../../../supabase/migrations/0034_p7_media_jobs.sql', import.meta.url), 'utf8');

  it('adds the two job kinds and a service-role-only keyed write', () => {
    assert.match(sql, /add value if not exists 'render_story'/);
    assert.match(sql, /add value if not exists 'depth_map'/);
    assert.match(sql, /p_key not in \('storyUrl', 'flyerUrl', 'depth'\)/);
    assert.match(sql, /revoke all on function public\.attach_media_url\(uuid, text, jsonb\) from public, anon, authenticated/);
  });
});
