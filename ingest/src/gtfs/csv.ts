import type { Readable } from 'node:stream';

/**
 * Streaming CSV reader for GTFS files.
 *
 * Streaming is not an optimisation here. `stop_times.txt` in the Israeli feed
 * is hundreds of megabytes — one row per stop per trip — and reading it into a
 * string is how the ingestion machine dies.
 *
 * Written by hand rather than adding a dependency (CLAUDE.md §2). GTFS is
 * RFC 4180 with no extensions: comma-separated, double-quoted fields, doubled
 * quotes for a literal quote. That is about eighty lines, and a dependency for
 * eighty lines of well-specified parsing is not a trade worth making.
 */

/**
 * Splits one CSV line into fields.
 *
 * Exported because it is the part worth testing on its own — the quoting rules
 * are where a hand-rolled parser goes wrong, and a Hebrew stop name containing
 * a comma is not hypothetical.
 */
export function splitLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

/**
 * Index of the next newline that is NOT inside a quoted field, or -1.
 *
 * Splitting naively on every newline corrupts any field containing one. GTFS
 * permits it, and an embedded newline in a stop name would shift every
 * subsequent field by one — putting a coordinate where a name belongs, which
 * surfaces as a bad number rather than a parse error and is correspondingly
 * hard to trace back.
 */
export function lineEnd(buffer: string): number {
  let quoted = false;

  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i];

    if (char === '"') {
      if (quoted && buffer[i + 1] === '"') {
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === '\n' && !quoted) return i;
  }

  return -1;
}

/**
 * Strips the UTF-8 BOM.
 *
 * GTFS exports routinely carry one, and it corrupts the FIRST HEADER NAME:
 * `stop_id` becomes `﻿stop_id`, so every lookup on it returns undefined
 * and the whole file parses to empty rows without a single error.
 */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/**
 * Yields one object per data row, keyed by header name.
 *
 * A row with the wrong field count is SKIPPED, not padded. Padding it out with
 * empty strings would put a stop at 0,0 — in the Gulf of Guinea — or, worse,
 * silently one field out of alignment.
 */
export async function* streamCsv(input: Readable): AsyncGenerator<Record<string, string>> {
  let buffer = '';
  let header: string[] | undefined;

  input.setEncoding('utf8');

  const emit = function* (raw: string): Generator<Record<string, string>> {
    const line = raw.replace(/\r$/, '');
    if (line === '') return;

    if (!header) {
      header = splitLine(stripBom(line)).map((name) => name.trim());
      return;
    }

    const fields = splitLine(line);
    if (fields.length !== header.length) return;

    const row: Record<string, string> = {};
    header.forEach((name, index) => {
      row[name] = fields[index] ?? '';
    });
    yield row;
  };

  for await (const chunk of input) {
    buffer += chunk as string;

    let cut = lineEnd(buffer);
    while (cut !== -1) {
      yield* emit(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 1);
      cut = lineEnd(buffer);
    }
  }

  yield* emit(buffer);
}
