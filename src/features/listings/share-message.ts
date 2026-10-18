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
  /**
   * The agent's own line after the title (0046), one line. A line break in
   * it would read as a second message.
   */
  line?: string;
  /** Short facts, already formatted with their units. Order is display order. */
  facts: readonly string[];
  /** Street and city, or just city. Omitted when the seller hid the address. */
  place?: string;
  /** Absolute, and the last line — see below. */
  url: string;
  /**
   * Optional seller declaration that the listing is not yet on the portals.
   * A line in the paste, not only on the page (DESIGN-BRIEF §5). The Hebrew
   * lives in locales/he.json — this layer interpolates, it does not own copy.
   */
  prePortalLine?: string;
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

  lines.push(input.price ? `${title} · ${input.price}` : title);

  const own = input.line?.replace(/\s+/g, ' ').trim();
  if (own) lines.push(own);

  if (input.facts.length > 0) {
    // A middle dot rather than a comma: the facts are already comma-shaped
    // internally ("קומה 3 מתוך 5") and two comma levels read as one list.
    lines.push(input.facts.join(' · '));
  }

  if (input.place) {
    lines.push('');
    lines.push(input.place);
  }

  if (input.prePortalLine) {
    lines.push('');
    lines.push(input.prePortalLine);
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

/**
 * "המחיר ירד" (0043): the title, the line about the price, the link last so
 * WhatsApp previews the new card. The line is the locale's, with both
 * figures already formatted.
 */
export function priceDropMessage(input: { title: string; line: string; url: string }): string {
  const title = input.title.replace(/\s*\n\s*/g, ' ').trim();
  return [title, input.line, '', input.url].join('\n');
}

/**
 * "נמכר": shared as an image with this text, since a sold listing has no
 * public page to preview. The agent's own page closes it when there is one.
 */
export function soldMessage(input: { title: string; line: string; agent: string; agentUrl?: string }): string {
  const title = input.title.replace(/\s*\n\s*/g, ' ').trim();
  const lines = [`${input.line} ${title}`, '', input.agent];
  if (input.agentUrl) lines.push(input.agentUrl);
  return lines.join('\n');
}
