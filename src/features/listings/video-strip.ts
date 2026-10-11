/**
 * A phone video carries the capture location in its metadata, and a video
 * cannot be redrawn on a canvas the way a photograph can (CLAUDE.md §9).
 *
 * This walks the MP4/MOV boxes and renames every `udta`, `meta` and top-level
 * `uuid` box to `free`. The type is four bytes and the sizes stay the same,
 * so every offset stays valid and the file still plays. Players ignore
 * `free`. The location bytes may remain inside that box; a box that is still
 * live must not contain them.
 *
 * Fail closed: a file that is not a movie, runs past 60s, is over 50MB, or
 * still has a location marker in a live box is refused. Nothing here is a guess.
 */

export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type VideoCodec = 'h264' | 'hevc';

export type VideoStrip =
  | { ok: true; bytes: Uint8Array; seconds: number; codec: VideoCodec; width: number; height: number }
  | { ok: false; reason: 'not_video' | 'too_long' | 'too_big' | 'location' | 'codec' };

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'moof', 'traf']);
const H264 = new Set(['avc1', 'avc3']);
const HEVC = new Set(['hvc1', 'hev1']);

const text = (value: string) => [...value].map((char) => char.charCodeAt(0));
const ISO6709 = text('ISO6709');
const APPLE_LOCATION = text('com.apple.quicktime.location');
const XYZ = [0xa9, 0x78, 0x79, 0x7a];

const u32 = (bytes: Uint8Array, at: number) =>
  bytes[at]! * 0x1000000 + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!;

const fourcc = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);

const has = (bytes: Uint8Array, from: number, to: number, needle: number[]) => {
  const last = to - needle.length;
  for (let at = from; at <= last; at += 1) {
    let match = true;
    for (let i = 0; i < needle.length; i += 1) {
      if (bytes[at + i] !== needle[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
};

interface Box {
  start: number;
  typeAt: number;
  payload: number;
  end: number;
  type: string;
}

function boxes(bytes: Uint8Array, from: number, to: number): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(bytes, at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return found;
      const high = u32(bytes, at + 8);
      const low = u32(bytes, at + 12);
      if (high !== 0) return found;
      size = low;
      header = 16;
    }
    const end = size === 0 ? to : at + size;
    if (end < at + header || end > to) return found;
    found.push({ start: at, typeAt: at + 4, payload: at + header, end, type: fourcc(bytes, at + 4) });
    if (size === 0) break;
    at = end;
  }
  return found;
}

const rename = (bytes: Uint8Array, typeAt: number) => {
  bytes[typeAt] = 0x66;
  bytes[typeAt + 1] = 0x72;
  bytes[typeAt + 2] = 0x65;
  bytes[typeAt + 3] = 0x65;
};

interface Read {
  seconds?: number;
  codec?: VideoCodec;
  width: number;
  height: number;
}

function readMvhd(bytes: Uint8Array, box: Box, read: Read) {
  if (box.payload + 20 > box.end) return;
  const version = bytes[box.payload]!;
  if (version === 0 && box.payload + 20 <= box.end) {
    const timescale = u32(bytes, box.payload + 12);
    const duration = u32(bytes, box.payload + 16);
    if (timescale > 0) read.seconds = duration / timescale;
  } else if (version === 1 && box.payload + 32 <= box.end) {
    const timescale = u32(bytes, box.payload + 20);
    const high = u32(bytes, box.payload + 24);
    const low = u32(bytes, box.payload + 28);
    if (timescale > 0) read.seconds = (high * 0x100000000 + low) / timescale;
  }
}

function readTkhd(bytes: Uint8Array, box: Box, read: Read) {
  const version = bytes[box.payload] ?? 0;
  const widthAt = box.payload + (version === 1 ? 88 : 76);
  if (widthAt + 8 > box.end) return;
  const width = u32(bytes, widthAt) / 65536;
  const height = u32(bytes, widthAt + 4) / 65536;
  if (width > 0 && height > 0) {
    read.width = Math.round(width);
    read.height = Math.round(height);
  }
}

function readStsd(bytes: Uint8Array, box: Box, read: Read) {
  const entries = boxes(bytes, box.payload + 8, box.end);
  const entry = entries[0];
  if (!entry) return;
  if (H264.has(entry.type)) read.codec = 'h264';
  else if (HEVC.has(entry.type)) read.codec = 'hevc';
}

function visit(bytes: Uint8Array, from: number, to: number, top: boolean, read: Read) {
  for (const box of boxes(bytes, from, to)) {
    if (box.type === 'mvhd') readMvhd(bytes, box, read);
    else if (box.type === 'tkhd') readTkhd(bytes, box, read);
    else if (box.type === 'stsd') readStsd(bytes, box, read);

    const drop = box.type === 'udta' || box.type === 'meta' || (top && box.type === 'uuid');
    if (drop) {
      rename(bytes, box.typeAt);
      continue;
    }
    if (CONTAINERS.has(box.type)) visit(bytes, box.payload, box.end, false, read);
  }
}

function liveHasLocation(bytes: Uint8Array, from: number, to: number): boolean {
  for (const box of boxes(bytes, from, to)) {
    if (box.type === 'free' || box.type === 'skip') continue;
    if (CONTAINERS.has(box.type)) {
      if (liveHasLocation(bytes, box.payload, box.end)) return true;
      continue;
    }
    if (
      (box.type.length === 4 && box.type.charCodeAt(0) === 0xa9 && box.type.slice(1) === 'xyz') ||
      has(bytes, box.payload, box.end, ISO6709) ||
      has(bytes, box.payload, box.end, APPLE_LOCATION) ||
      has(bytes, box.start, box.end, XYZ)
    ) {
      return true;
    }
  }
  return false;
}

/** Patches a copy. The caller's buffer is left alone. */
export function stripVideoLocation(input: Uint8Array): VideoStrip {
  if (input.length === 0 || input.length > VIDEO_MAX_BYTES) {
    return { ok: false, reason: input.length > VIDEO_MAX_BYTES ? 'too_big' : 'not_video' };
  }
  const bytes = new Uint8Array(input);
  if (boxes(bytes, 0, bytes.length).length === 0) return { ok: false, reason: 'not_video' };

  const read: Read = { width: 0, height: 0 };
  visit(bytes, 0, bytes.length, true, read);

  if (liveHasLocation(bytes, 0, bytes.length)) return { ok: false, reason: 'location' };
  if (read.seconds === undefined || !Number.isFinite(read.seconds) || read.seconds <= 0) {
    return { ok: false, reason: 'not_video' };
  }
  if (read.seconds > VIDEO_MAX_SECONDS) return { ok: false, reason: 'too_long' };
  if (!read.codec) return { ok: false, reason: 'codec' };

  return {
    ok: true,
    bytes,
    seconds: Math.round(read.seconds),
    codec: read.codec,
    width: read.width,
    height: read.height,
  };
}
