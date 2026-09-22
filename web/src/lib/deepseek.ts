/**
 * The DeepSeek call, from the Worker and nowhere else.
 *
 * ============================= WHERE THE KEY IS =============================
 * `DEEPSEEK_API_KEY`, a Cloudflare Worker SECRET, read from the request's
 * runtime env. It is NOT a `PUBLIC_` variable, it is not inlined at build
 * time, and it never reaches a browser — which is the whole reason this is a
 * server route and not a fetch from the editor island. A key in the bundle is
 * a key anyone can spend.
 *
 *   npx wrangler secret put DEEPSEEK_API_KEY
 *
 * WITHOUT IT NOTHING BREAKS. The caller falls back to the grounded paragraph
 * built from the seller's own facts, so the editor works on a deploy that has
 * never had a model key. See listing-copy.ts.
 * ===========================================================================
 *
 * Not the `ingest/` client. That one runs in Node, on a schedule, against the
 * proximity lists; this is one request from one signed-in agent pressing a
 * button, on workerd, where there is no Node HTTP stack. The prompts and the
 * guards are shared — they live in `src/features/listings/` — and only the
 * transport is duplicated, which is the part that has to differ.
 */

import { deepseekDelta } from '@/features/listings/sse';

const DEFAULT_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Long enough for a paragraph, short enough that a hung provider does not
 * hold the agent's editor open. The fallback is already written by then.
 */
const TIMEOUT_MS = 12_000;

export interface ParagraphRequest {
  apiKey: string;
  system: string;
  user: string;
  /** Overridable for a proxy or a self-hosted gateway. */
  baseUrl?: string;
}

/**
 * One paragraph, or undefined.
 *
 * Every failure is undefined rather than a throw: a rate limit, a timeout, a
 * 500 from the provider and a reply in the wrong shape are the same event to
 * the caller, which is "use the grounded paragraph instead".
 */
export async function deepseekParagraph(
  request: ParagraphRequest,
): Promise<string | undefined> {
  try {
    const response = await fetch(request.baseUrl ?? DEFAULT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        // Low, not zero. Zero produces the same sentence shape for every
        // listing, and an agency publishing twenty flats would ship twenty
        // pages that read as one template.
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return undefined;

    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;

    return typeof content === 'string' && content.trim() !== '' ? content : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Same call, streamed. Tokens are forwarded as they arrive so the editor can
 * type the paragraph in; the returned string is the full draft to run through
 * acceptDescription / acceptAreaNote. A stream that dies mid-sentence is
 * undefined — the caller uses the grounded paragraph.
 */
export async function deepseekParagraphStreaming(
  request: ParagraphRequest,
  onToken: (token: string) => void,
): Promise<string | undefined> {
  try {
    const response = await fetch(request.baseUrl ?? DEFAULT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.4,
        max_tokens: 400,
        stream: true,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok || !response.body) return undefined;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const token = deepseekDelta(line.slice(5));
        if (!token) continue;
        full += token;
        onToken(token);
      }
    }

    const tail = buffer.startsWith('data:') ? deepseekDelta(buffer.slice(5)) : deepseekDelta(buffer);
    if (tail) {
      full += tail;
      onToken(tail);
    }

    return full.trim() === '' ? undefined : full;
  } catch {
    return undefined;
  }
}
