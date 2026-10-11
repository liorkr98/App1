import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VIDEO_MAX_BYTES, stripVideoLocation } from './video-strip.js';

const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];

function box(type: string, payload: number[]): Uint8Array {
  const size = 8 + payload.length;
  return new Uint8Array([...u32(size), ...[...type].map((char) => char.charCodeAt(0)), ...payload]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** version 0 movie header: timescale 1000, duration in ms. */
function mvhd(ms: number): Uint8Array {
  const payload = new Array(20).fill(0);
  payload.splice(12, 4, ...u32(1000));
  payload.splice(16, 4, ...u32(ms));
  return box('mvhd', payload);
}

function stsd(codec: string): Uint8Array {
  const entry = box(codec, new Array(8).fill(0));
  return box('stsd', [...u32(0), ...u32(1), ...entry]);
}

function movie(ms: number, codec: string, extra: Uint8Array[] = []): Uint8Array {
  const moov = box('moov', [...mvhd(ms), ...stsd(codec), ...extra.flatMap((part) => [...part])]);
  return concat(box('ftyp', [...[...'isom'].map((c) => c.charCodeAt(0))]), moov);
}

describe('stripVideoLocation', () => {
  it('renames a location user-data box to free and keeps the duration and codec', () => {
    const marker = [...'com.apple.quicktime.location ISO6709'].map((char) => char.charCodeAt(0));
    const udta = box('udta', [...box('\u00a9xyz', marker)]);
    const file = movie(5000, 'avc1', [udta]);
    const stripped = stripVideoLocation(file);
    assert.equal(stripped.ok, true);
    if (!stripped.ok) return;
    assert.equal(stripped.seconds, 5);
    assert.equal(stripped.codec, 'h264');
    assert.equal(String.fromCharCode(...stripped.bytes.subarray(file.length - udta.length + 4, file.length - udta.length + 8)), 'free');
    const asText = [...stripped.bytes].map((byte) => String.fromCharCode(byte)).join('');
    assert.equal(asText.includes('udta'), false);
  });

  it('refuses a location marker that is still in a live box', () => {
    const marker = [...'ISO6709'].map((char) => char.charCodeAt(0));
    const file = movie(3000, 'hvc1', [box('free', marker), box('gnre', marker)]);
    // `free` is ignored; `gnre` is live and still carries the marker.
    const stripped = stripVideoLocation(file);
    assert.deepEqual(stripped, { ok: false, reason: 'location' });
  });

  it('refuses a film longer than a minute, and a codec it cannot name', () => {
    assert.equal(stripVideoLocation(movie(61_000, 'avc1')).ok, false);
    assert.deepEqual(stripVideoLocation(movie(61_000, 'avc1')), { ok: false, reason: 'too_long' });
    assert.deepEqual(stripVideoLocation(movie(2000, 'mp4a')), { ok: false, reason: 'codec' });
    assert.deepEqual(stripVideoLocation(new Uint8Array([1, 2, 3, 4])), { ok: false, reason: 'not_video' });
    assert.deepEqual(stripVideoLocation(new Uint8Array(VIDEO_MAX_BYTES + 1)), { ok: false, reason: 'too_big' });
  });
});
