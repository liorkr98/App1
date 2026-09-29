/**
 * The one part of `qrcode` the site uses: the pure encoder. Its server entry
 * pulls in PNG and filesystem code that does not belong in a Worker, so
 * QrCode.astro imports the core directly and draws the SVG itself.
 */
declare module 'qrcode/lib/core/qrcode.js' {
  export function create(
    text: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
  ): { modules: { size: number; data: Uint8Array } };
}
