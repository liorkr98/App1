import { clampRect, mosaicCell, type PlateRect } from '@/features/listings/plate-rect';

/**
 * Covers a licence plate in a photograph, in the agent's browser (19 Oct
 * 2026; CLAUDE.md §7: never publish a plate). The new file replaces the
 * photograph, so the plate is gone from the pixels, not hidden by the page.
 *
 *   blur  a coarse mosaic: the rectangle drawn at an eighth of its width and
 *         scaled back up without smoothing. Not `ctx.filter`, which older
 *         Safari does not have, and a mosaic this coarse cannot be read back.
 *   logo  the agency's logo on white, fitted inside the rectangle.
 *
 * The result goes through the canvas, so like every re-encode here it carries
 * no EXIF.
 */
export type PlateMode = 'blur' | 'logo';

export interface CoveredPhoto {
  blob: Blob;
  width: number;
  height: number;
}

const load = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image'));
    image.src = url;
  });

export async function coverPlate(
  source: string,
  rect: PlateRect,
  mode: PlateMode,
  logoUrl?: string,
): Promise<CoveredPhoto | undefined> {
  try {
    const image = await load(source);
    const logo = mode === 'logo' && logoUrl ? await load(logoUrl) : undefined;
    if (mode === 'logo' && !logo) return undefined;

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0);

    const area = clampRect(rect);
    const x = Math.round(area.x * width);
    const y = Math.round(area.y * height);
    const w = Math.max(1, Math.round(area.w * width));
    const h = Math.max(1, Math.round(area.h * height));

    if (logo) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      const pad = Math.round(Math.min(w, h) * 0.12);
      const scale = Math.min((w - pad * 2) / logo.naturalWidth, (h - pad * 2) / logo.naturalHeight);
      const lw = logo.naturalWidth * scale;
      const lh = logo.naturalHeight * scale;
      ctx.drawImage(logo, x + (w - lw) / 2, y + (h - lh) / 2, lw, lh);
    } else {
      const cell = mosaicCell(w);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.ceil(w / cell));
      small.height = Math.max(1, Math.ceil(h / cell));
      const tiny = small.getContext('2d');
      if (!tiny) return undefined;
      tiny.imageSmoothingEnabled = true;
      tiny.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    return blob ? { blob, width, height } : undefined;
  } catch {
    return undefined;
  }
}
