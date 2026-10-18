import type { ListingCopyInput } from './listing-copy.js';
import { descriptionPrompt } from './listing-copy.js';
import { findBannedWords, findUnsupportedNumbers, tidyParagraph } from './description.js';

/**
 * A title for the page and one line for the WhatsApp message (18 Oct 2026),
 * written by DeepSeek from the listing's own facts, for the agent to keep,
 * edit or ignore.
 *
 * The rules are the description's (description.ts), tighter: no number the
 * facts do not hold (so no house number, no invented size), no valuation,
 * no superlatives, no link, no model name. An answer that breaks one is no
 * suggestion — never an error in front of the agent.
 */

export const TITLE_MAX = 60;
/** listings.share_line allows 160 (0046); a WhatsApp preview line shows about this much. */
export const LINE_MAX = 120;

export const HEADLINE_SYSTEM_PROMPT =
  'אתה כותב לסוכן נדל״ן או לסוחר רכב שתי שורות קצרות בעברית. החזר json בלבד. ' +
  'דוגמה: {"title":"דירת 4 חדרים עם מרפסת שמש","line":"משופצת, קומה גבוהה, כניסה מיידית."} ' +
  `title: כותרת לדף, עד ${TITLE_MAX} תווים, אומרת מה זה ומה הכי בולט בו. ` +
  `line: שורה אחת שנשלחת בוואטסאפ אחרי הכותרת, עד ${LINE_MAX} תווים, שתי עובדות או שלוש שקונה רוצה לדעת. ` +
  'רק עובדות מהרשימה. אסור להמציא מספר, מקום או מרחק. בלי מספר בית. ' +
  'אסור שווי, השקעה, תשואה או פוטנציאל. אסור מילות הפלגה כמו חלומית, מדהימה, ייחודית, מושלמת, יוקרתית. ' +
  'בלי אמוג׳י, בלי קישור, בלי שם של מודל.';

export function headlinePrompt(input: ListingCopyInput): string {
  return descriptionPrompt(input);
}

const HEBREW = /[֐-׿]/;

/**
 * An ASCII double quote between Hebrew letters is a gershayim typed the easy
 * way (ממ"ד). The page uses U+05F4 (CLAUDE.md §5), so it is mended, not
 * refused; an ASCII apostrophe after a Hebrew letter is a geresh the same way.
 */
function mendPunctuation(text: string): string {
  return text.replace(/([א-ת])"(?=[א-ת])/g, '$1״').replace(/([א-ת])'/g, '$1׳');
}

function acceptLine(raw: unknown, max: number, input: ListingCopyInput): string | undefined {
  // Two lines is two messages in a chat; tidyParagraph would join them.
  if (typeof raw !== 'string' || /\n/.test(raw.trim())) return undefined;
  const text = mendPunctuation(tidyParagraph(raw)).replace(/[.\s]+$/, (end) => (end.includes('.') ? '.' : ''));
  if (text.length < 8 || text.length > max) return undefined;
  if (!HEBREW.test(text)) return undefined;
  if (/https?:\/\/|www\./i.test(text)) return undefined;
  if (/deepseek|openai|chatgpt|gpt/i.test(text)) return undefined;
  if (findBannedWords(text).length > 0) return undefined;
  if (findUnsupportedNumbers(text, input.facts).length > 0) return undefined;
  return text;
}

/** What the model answered, kept part by part: a good title survives a bad line. */
export function acceptHeadline(raw: string, input: ListingCopyInput): { title?: string; line?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const record = parsed as { title?: unknown; line?: unknown };
  const title = acceptLine(record.title, TITLE_MAX, input);
  const line = acceptLine(record.line, LINE_MAX, input);
  return { ...(title ? { title: title.replace(/\.$/, '') } : {}), ...(line ? { line } : {}) };
}
