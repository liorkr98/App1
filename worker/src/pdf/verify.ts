import { getDocument } from 'pdfjs-dist';

import { containsHebrew, containsSentinel } from './hebrew.js';

/**
 * Proving the PDF actually contains Hebrew.
 *
 * This check exists because of one specific, quiet failure: if the fonts are
 * not embedded, Chrome still produces a perfectly valid PDF — it just draws
 * every Hebrew glyph as an empty box on any machine that lacks the font.
 * Nothing errors. The job succeeds, the file uploads, the link works, and the
 * first person to find out is a buyer looking at a page of rectangles.
 *
 * So the pipeline reads its own output back. That is a real end-to-end proof:
 * text only extracts if the font carries a ToUnicode map, and it only carries
 * one when it is embedded.
 */

export class PdfMissingHebrew extends Error {
  constructor(readonly sample: string) {
    super('the rendered PDF contains no Hebrew text — the fonts are not embedded');
    this.name = 'PdfMissingHebrew';
  }
}

/** Concatenates the text of every page, in the order the PDF stores it. */
export async function extractText(pdf: Uint8Array): Promise<string> {
  const document = await getDocument({
    data: pdf,
    // There is no DOM here. Left on, pdfjs tries to fetch font data and to
    // eval helper code; both fail in the container, and text extraction needs
    // neither.
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const pages: string[] = [];

  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();

      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
  } finally {
    await document.destroy();
  }

  return pages.join('\n');
}

export interface HebrewCheck {
  hebrewFound: boolean;
  sentinelFound: boolean;
  characters: number;
}

/**
 * The gate the job runs before it publishes anything.
 *
 * Throws when no Hebrew survived at all — the boxes-instead-of-letters case,
 * where the file must not be published. A missing SENTINEL is reported but not
 * fatal: the CTA can legitimately be absent from a listing with no phone
 * number, and refusing to produce a PDF over that would be the check
 * outranking the product.
 */
export async function assertHebrewRenders(pdf: Uint8Array): Promise<HebrewCheck> {
  const text = await extractText(pdf);

  if (!containsHebrew(text)) {
    throw new PdfMissingHebrew(text.slice(0, 200));
  }

  return {
    hebrewFound: true,
    sentinelFound: containsSentinel(text),
    characters: text.length,
  };
}
