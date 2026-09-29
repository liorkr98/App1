import { create } from 'qrcode/lib/core/qrcode.js';

/**
 * A QR code as one SVG path: each dark module is an `M…h1v1h-1z` square,
 * merged, with the four-module quiet zone the standard asks for inside the
 * box. Shared by QrCode.astro (drawn on the server, 0 KB to the buyer) and
 * the dashboard's Share Studio (imported only when the panel opens).
 */
export interface QrDrawing {
  /** Width and height of the viewBox, quiet zone included. */
  box: number;
  d: string;
}

const QUIET = 4;

export function qrDrawing(text: string): QrDrawing {
  const { size, data } = create(text, { errorCorrectionLevel: 'M' }).modules;
  let d = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (data[row * size + col]) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { box: size + QUIET * 2, d };
}

/** A standalone SVG file, for printing on a flyer or a sign. */
export function qrSvgFile(text: string, ink = '#15140f', paper = '#ffffff'): string {
  const { box, d } = qrDrawing(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box * 16}" height="${box * 16}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="${paper}"/><path d="${d}" fill="${ink}"/></svg>`;
}
