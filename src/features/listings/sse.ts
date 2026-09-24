/**
 * Tiny SSE helpers for the description stream.
 *
 * The model key stays on the Worker. The browser only sees `token` / `done`
 * events, and `done` carries the paragraph that already passed accept*().
 */

/** One `delta.content` string from an OpenAI-compatible stream line, or nothing. */
export function deepseekDelta(data: string): string | undefined {
  const trimmed = data.trim();
  if (trimmed === '' || trimmed === '[DONE]') return undefined;

  try {
    const json = JSON.parse(trimmed) as {
      choices?: { delta?: { content?: unknown } }[];
    };
    const content = json.choices?.[0]?.delta?.content;
    return typeof content === 'string' && content.length > 0 ? content : undefined;
  } catch {
    return undefined;
  }
}

export interface SseEvent {
  event: string;
  data: string;
}

/** Split a buffered SSE chunk into events. Leftover (incomplete) stays in `rest`. */
export function splitSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') });
  }

  return { events, rest };
}
