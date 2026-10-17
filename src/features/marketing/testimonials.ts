/**
 * What agents say about the product, for the homepage (Testimonials.astro).
 *
 * EMPTY UNTIL THERE ARE REAL ONES, and the section does not render while it
 * is. On 17 Oct 2026 the owner asked for invented agents and quotes to fill
 * it; that was declined. These pages are sent to Israeli estate agents, and a
 * made-up endorsement presented as real is misleading advertising, which is
 * also the rule in docs/DESIGN-SKILLS.md ("proof is never invented").
 *
 * To add one: the agent's own words, approved by them as written, with how
 * and when they said yes. `consentRecorded` is checked by the unit test, so
 * an entry without it fails the build.
 */
export interface Testimonial {
  /** Their words, exactly as they approved them. Hebrew. */
  quote: string;
  /** As they agreed to be named: full name, or first name and initial. */
  name: string;
  /** What they do and where, e.g. "סוכנת נדל״ן, חולון". */
  role: string;
  consent: {
    /** The day they approved this text, YYYY-MM-DD. */
    date: string;
    /** How, e.g. "WhatsApp, אישרה את הנוסח המלא". Kept, not shown. */
    how: string;
  };
}

export const TESTIMONIALS: readonly Testimonial[] = [];

/** An entry the homepage may show: every field filled and consent dated, not in the future. */
export function consentRecorded(entry: Testimonial, today: Date = new Date()): boolean {
  const filled = [entry.quote, entry.name, entry.role, entry.consent.how].every((text) => text.trim() !== '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry.consent.date);
  if (!filled || !match) return false;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === entry.consent.date && day <= today;
}

/** The testimonials the homepage shows: only those with consent on record. */
export function shownTestimonials(list: readonly Testimonial[] = TESTIMONIALS): Testimonial[] {
  return list.filter((entry) => consentRecorded(entry));
}
