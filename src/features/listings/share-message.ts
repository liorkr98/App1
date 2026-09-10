/**
 * The message an agent sends.
 *
 * THE COMPLAINT THIS ANSWERS, in the agent's own words: to send a listing to a
 * new buyer they have to find the message they sent someone else and copy it.
 *
 * So the message is not a nicety around the link — it IS the artefact. An
 * agent forwards the same property to buyers over weeks, and every send today
 * means scrolling WhatsApp for something they wrote once. Composing it from
 * the listing means it is always there, always current, and identical every
 * time.
 *
 * Pure and shared so it can be tested. What an agent pastes into a client
 * conversation is not something to find out about from a screenshot.
 */

export interface ShareInput {
  /** Page title, newlines already meaningful — they become one line here. */
  title: string;
  /** Formatted with the currency sign, e.g. ₪1,850,000. */
  price: string;
  /** Short facts, already formatted with their units. Order is display order. */
  facts: readonly string[];
  /** Street and city, or just city. Omitted when the seller hid the address. */
  place?: string;
  /** Absolute, and the last line — see below. */
  url: string;
}

/**
 * WhatsApp shows a preview for the LAST link in a message, so the URL goes at
 * the end. A link in the middle of a paragraph still becomes a card, but the
 * text after it is what gets truncated in the chat list.
 */
export function shareMessage(input: ShareInput): string {
  const lines: string[] = [];

  // The title carries its own line breaks for the page hero; in a chat those
  // become one line, because a two-line title reads as two messages.
  const title = input.title.replace(/\s*\n\s*/g, ' ').trim();

  lines.push(`${title} · ${input.price}`);

  if (input.facts.length > 0) {
    // A middle dot rather than a comma: the facts are already comma-shaped
    // internally ("קומה 3 מתוך 5") and two comma levels read as one list.
    lines.push(input.facts.join(' · '));
  }

  if (input.place) {
    lines.push('');
    lines.push(input.place);
  }

  lines.push('');
  lines.push(input.url);

  return lines.join('\n');
}

/**
 * The same message, encoded for a wa.me link.
 *
 * encodeURIComponent handles Hebrew as UTF-8, which is what WhatsApp expects.
 * Newlines survive as %0A.
 */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
