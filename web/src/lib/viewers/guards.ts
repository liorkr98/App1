/**
 * Panorama size guard (RESEARCH.md §3.1).
 *
 * Photo Sphere Viewer has NO multi-resolution tiling, unlike Pannellum and
 * Marzipano. Handed an oversized equirectangular it will try to decode the
 * whole thing into a single WebGL texture, and on a mid-range Android phone
 * that means a long freeze and often a lost context — the tab appears to hang
 * with no error anywhere.
 *
 * The pipeline caps panoramas at 6000x3000 server-side. This is the client
 * half of that: Stage C asks for it as a renderer guard rather than only a
 * pipeline convention, because a convention protects nothing once someone
 * uploads a panorama through a path that skips the pipeline.
 */

export const MAX_PANORAMA_WIDTH = 6000;
export const MAX_PANORAMA_HEIGHT = 3000;

export interface PanoramaCheck {
  ok: boolean;
  width: number;
  height: number;
  reason?: string;
}

/**
 * Reads the intrinsic size before the panorama reaches the renderer.
 *
 * The browser decodes the header only for naturalWidth/naturalHeight, so this
 * costs a fraction of a full decode — cheap enough to run before every scene.
 */
export function checkPanorama(url: string): Promise<PanoramaCheck> {
  return new Promise((resolve) => {
    const probe = new Image();

    probe.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = probe;

      if (width > MAX_PANORAMA_WIDTH || height > MAX_PANORAMA_HEIGHT) {
        resolve({
          ok: false,
          width,
          height,
          reason: `panorama ${width}x${height} exceeds the ${MAX_PANORAMA_WIDTH}x${MAX_PANORAMA_HEIGHT} cap`,
        });
        return;
      }

      resolve({ ok: true, width, height });
    };

    probe.onerror = () => {
      resolve({ ok: false, width: 0, height: 0, reason: 'panorama could not be loaded' });
    };

    probe.src = url;
  });
}

/**
 * WebGL availability.
 *
 * No WebGL means no viewer at all, and the correct response is to fall back to
 * the photo gallery silently — an error message would be telling the user
 * about a limitation of their device that they cannot act on.
 */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Honours the OS reduce-motion setting for auto-rotate and autoplay. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
