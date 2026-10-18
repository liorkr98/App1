import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import type { PhotoReview } from './photo-review.js';
import { cleanPlanRooms, cleanVideo, depthFor, SPIN_MIN, spinFrames, spinFromGallery } from './rich-media.js';

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

describe('cleanVideo', () => {
  const video = {
    url: 'https://cdn.test/storage/v1/object/public/derived/abc/browser/video-1.mp4',
    posterUrl: 'https://cdn.test/storage/v1/object/public/derived/abc/browser/video-1.webp',
    width: 1080,
    height: 1920,
    seconds: 15.2,
    codec: 'h264',
  };

  it('keeps a file under this listing and drops anything else', () => {
    assert.equal(cleanVideo(video, 'abc')?.seconds, 15);
    assert.equal(cleanVideo(video, 'other'), undefined);
    assert.equal(cleanVideo({ ...video, codec: 'gif' }, 'abc'), undefined);
    assert.equal(cleanVideo({ ...video, seconds: 90 }, 'abc'), undefined);
    assert.equal(cleanVideo({ ...video, url: 'http://cdn.test/abc/browser/v.mp4' }, 'abc'), undefined);
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

describe('spinFromGallery — the 360 from photos already uploaded (18 Oct 2026)', () => {
  const photo = (id: string) => ({ id });
  const at = (angle: PhotoReview['angle'], score?: number): PhotoReview => ({
    issues: [],
    ...(angle ? { angle } : {}),
    ...(score ? { score } : {}),
  });

  it('goes round the car in walking order, one photo per angle, the best of two', () => {
    const photos = ['rear', 'inside', 'front', 'left', 'right', 'left2'].map(photo);
    const reviews = new Map<string, PhotoReview>([
      ['rear', at('rear')],
      ['inside', at('interior', 5)],
      ['front', at('front')],
      ['left', at('left', 2)],
      ['right', at('right')],
      ['left2', at('left', 4)],
    ]);
    assert.deepEqual(spinFromGallery(photos, reviews).map((item) => item.id), ['front', 'left2', 'rear', 'right']);
  });

  it('is no spin with fewer than four sides of the car', () => {
    const photos = ['a', 'b', 'c', 'd'].map(photo);
    const reviews = new Map<string, PhotoReview>([
      ['a', at('front')],
      ['b', at('frontLeft')],
      ['c', at('left')],
      ['d', at('engine')],
    ]);
    assert.deepEqual(spinFromGallery(photos, reviews), []);
    assert.ok(SPIN_MIN === 4);
  });
});
