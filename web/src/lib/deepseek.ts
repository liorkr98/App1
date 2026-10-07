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
/** Exported for the admin status check (web/src/pages/api/status.ts). */
export const DEEPSEEK_URL = DEFAULT_URL;

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
  /**
   * Default 0.4. A second press of "another description" needs more range or
   * the same facts produce the same paragraph and the button looks dead.
   */
  temperature?: number;
  /**
   * Default 400 tokens and 12 s: one paragraph. The agent-format description
   * is three paragraphs with the neighbourhood, which is roughly twice the
   * Hebrew, and a cut-off reply fails its checks and falls back — so that
   * caller asks for more room and more time.
   */
  maxTokens?: number;
  timeoutMs?: number;
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
        temperature: request.temperature ?? 0.4,
        max_tokens: request.maxTokens ?? 400,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? TIMEOUT_MS),
    });

    if (!response.ok) {
      modelLog(`http_${response.status}`);
      return undefined;
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;

    if (typeof content === 'string' && content.trim() !== '') return content;
    modelLog('empty');
    return undefined;
  } catch (error) {
    modelLog(failureCode(error));
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
        temperature: request.temperature ?? 0.4,
        max_tokens: request.maxTokens ?? 400,
        stream: true,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? TIMEOUT_MS),
    });

    if (!response.ok || !response.body) {
      modelLog(`http_${response.status}`);
      return undefined;
    }

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

    if (full.trim() === '') {
      modelLog('empty');
      return undefined;
    }
    return full;
  } catch (error) {
    modelLog(failureCode(error));
    return undefined;
  }
}

/**
 * Why the model gave nothing, as a code for the Worker log (Cloudflare
 * Observability). Never the prompt or the reply: both are the seller's
 * listing (CLAUDE.md §9). Before 7 Oct 2026 every failure here was silent,
 * so "the AI never answers" could not be told apart from "the AI answers and
 * every reply is refused".
 */
function modelLog(code: string): void {
  console.warn(`deepseek ${code}`);
}

function failureCode(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
}
