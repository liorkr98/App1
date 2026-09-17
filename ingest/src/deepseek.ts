import {
  acceptNeighborhoodNote,
  buildNeighborhoodPrompt,
  groundedAreaDescription,
  NEIGHBORHOOD_SYSTEM_PROMPT,
  type NeighborhoodFacts,
} from '../../src/features/listings/neighborhood-note.js';
import type { NeighborhoodNote } from '@/types/listing.js';

/**
 * DeepSeek chat, at publish only.
 *
 * The key is DEEPSEEK_API_KEY in Fly secrets. Never a PUBLIC_ variable, never
 * the repo, never the listing page. A missing key or a rejected reply is a
 * silent omit — the page has the lists either way (CLAUDE.md §7).
 *
 * The request body is names and minutes. Coordinates of a home do not leave
 * this process, and neither the prompt nor the reply is logged.
 */

const DEFAULT_URL = 'https://api.deepseek.com/chat/completions';

export async function neighborhoodNoteFromFacts(
  facts: NeighborhoodFacts,
): Promise<NeighborhoodNote | undefined> {
  const prompt = buildNeighborhoodPrompt(facts);
  if (prompt.trim() === '') return undefined;

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    const grounded = groundedAreaDescription(facts);
    return acceptNeighborhoodNote(grounded, facts);
  }

  const url = (process.env.DEEPSEEK_API_URL ?? DEFAULT_URL).replace(/\/+$/, '');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: NEIGHBORHOOD_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      const grounded = groundedAreaDescription(facts);
      return acceptNeighborhoodNote(grounded, facts);
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      const accepted = acceptNeighborhoodNote(content, facts);
      if (accepted) return accepted;
    }
  } catch {
    // Silent omit of the model; the deterministic paragraph still publishes.
  }

  const grounded = groundedAreaDescription(facts);
  return acceptNeighborhoodNote(grounded, facts);
}
