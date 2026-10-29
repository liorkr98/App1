/**
 * What the agent turns on for one page (migration 0047, 19 Oct 2026), and
 * the outbound video link. Each is off until the agent turns it on.
 *
 * cleanExtras mirrors public.listing_extras_ok: the database refuses a
 * shape this would not keep, and the page keeps only what this does, so a
 * row edited by hand cannot put anything else on a public page.
 */

export interface OpenHouse {
  /** ISO 8601 with an offset. */
  start: string;
  end: string;
}

export interface ListingExtras {
  /** A second WhatsApp button, to book a visit (flat) or a test drive (car). */
  visit?: true;
  /** A mortgage (flat) or loan (car) calculator at the bottom of the page. */
  calculator?: true;
  /** A car under warranty, as the seller declares it (CLAUDE.md §7: לפי המוכר). */
  warranty?: true;
  openHouse?: OpenHouse;
  /** The photo slideshow film on the page (0048): off unless the agent turns it on. */
  film?: true;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const OPEN_HOUSE_MAX_HOURS = 8;

export function cleanOpenHouse(value: unknown): OpenHouse | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { start, end } = value as { start?: unknown; end?: unknown };
  if (typeof start !== 'string' || typeof end !== 'string' || !ISO.test(start) || !ISO.test(end)) return undefined;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return undefined;
  if (to - from > OPEN_HOUSE_MAX_HOURS * 3_600_000) return undefined;
  return { start, end };
}

export function cleanExtras(value: unknown): ListingExtras {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const openHouse = cleanOpenHouse(record.openHouse);
  return {
    ...(record.visit === true ? { visit: true } : {}),
    ...(record.calculator === true ? { calculator: true } : {}),
    ...(record.warranty === true ? { warranty: true } : {}),
    ...(record.film === true ? { film: true } : {}),
    ...(openHouse ? { openHouse } : {}),
  };
}

/** The open house while it is still to come or under way; gone once it ends. */
export function upcomingOpenHouse(extras: ListingExtras | undefined, now: number): OpenHouse | undefined {
  const open = extras?.openHouse;
  return open && Date.parse(open.end) > now ? open : undefined;
}

/**
 * An open house from the editor's date and two times, read as Israel time.
 * The offset is taken for that date, so a date across the clock change is
 * still the hour the agent typed.
 */
export function openHouseFrom(date: string, from: string, to: string): OpenHouse | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return undefined;
  const offset = israelOffset(date, from);
  return cleanOpenHouse({ start: `${date}T${from}:00${offset}`, end: `${date}T${to}:00${offset}` });
}

/** "+03:00" in summer, "+02:00" in winter, for that wall-clock moment in Israel. */
export function israelOffset(date: string, time: string): string {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const hours = Math.round((local - guess) / 3_600_000);
  return `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

/**
 * The video link: YouTube, TikTok or Instagram, https only. Anything else is
 * no link — the page opens these in a new tab and never embeds them, so the
 * host list is what keeps a listing from linking anywhere at all.
 */
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com'] as const;

export function cleanVideoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return undefined;
  const host = url.hostname.toLowerCase().replace(/^(www|m|vm)\./, '');
  if (!VIDEO_HOSTS.some((allowed) => host === allowed)) return undefined;
  return url.toString();
}
