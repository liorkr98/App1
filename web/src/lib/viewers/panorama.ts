import type { PanoScene, SceneLink } from '@/types/listing';

import { track } from './analytics';
import { checkPanorama, prefersReducedMotion } from './guards';

/**
 * The panorama viewer — Photo Sphere Viewer.
 *
 * ONE component for BOTH the property tour and the vehicle interior. Stage C3
 * is explicit: if you find yourself writing a second panorama viewer, stop and
 * extract a shared one. A vehicle interior is a single-scene tour, so it is
 * the same code with a one-element scene list and no links.
 *
 * Everything here is dynamically imported by the caller, so none of Photo
 * Sphere Viewer or three.js is in the initial page bundle.
 */

export interface PanoramaOptions {
  container: HTMLElement;
  scenes: PanoScene[];
  links: SceneLink[];
  /** Called with a Hebrew message when the viewer cannot start. */
  onError: (message: string) => void;
}

export interface PanoramaHandle {
  destroy: () => void;
}

export async function mountPanorama(options: PanoramaOptions): Promise<PanoramaHandle | null> {
  const { container, scenes, links, onError } = options;

  const first = scenes[0];
  if (!first) {
    onError('לא נמצאו חדרים בסיור');
    return null;
  }

  // Guard BEFORE handing anything to the renderer. An oversized panorama does
  // not error — it freezes the tab.
  const check = await checkPanorama(first.panoUrl);
  if (!check.ok) {
    track('viewer_failed', { reason: check.reason ?? 'panorama check failed' });
    onError('לא הצלחנו לטעון את הסיור');
    return null;
  }

  const [{ Viewer }, { VirtualTourPlugin }, { MarkersPlugin }, { GyroscopePlugin }] =
    await Promise.all([
      import('@photo-sphere-viewer/core'),
      import('@photo-sphere-viewer/virtual-tour-plugin'),
      import('@photo-sphere-viewer/markers-plugin'),
      import('@photo-sphere-viewer/gyroscope-plugin'),
    ]);

  // NOTE: the plan plugin is deliberately NOT installed. It renders a floor
  // plan, the Listing model carries none, and it would pull Leaflet in for
  // something with nothing to draw. Stage C: "omit the plugin entirely when it
  // does not [exist] — do not ship dead weight."

  const viewer = new Viewer({
    container,
    // Equirectangular is the default adapter; naming it keeps the intent
    // explicit for whoever adds cubemap support later.
    defaultYaw: first.yaw ?? 0,
    defaultPitch: first.pitch ?? 0,
    navbar: ['zoom', 'move', 'gyroscope', 'fullscreen'],
    // autorotateDelay is unset, so the viewer never auto-rotates. That is
    // already the reduce-motion-safe behaviour, so there is nothing to branch
    // on here — if auto-rotate is ever turned on, it must be gated on
    // prefersReducedMotion().
    plugins: [
      [MarkersPlugin, {}],
      [GyroscopePlugin, { touchmove: true, absolutePosition: false }],
      [
        VirtualTourPlugin,
        {
          positionMode: 'manual',
          renderMode: 'markers',
          nodes: scenes.map((scene) => ({
            id: scene.id,
            panorama: scene.panoUrl,
            thumbnail: scene.thumbUrl,
            name: scene.label,
            links: links
              .filter((link) => link.fromSceneId === scene.id)
              .map((link) => ({
                nodeId: link.toSceneId,
                position: { yaw: `${link.yaw}deg`, pitch: `${link.pitch}deg` },
                name: link.label,
              })),
          })),
          startNodeId: first.id,
        },
      ],
    ],
  });

  const tour = viewer.getPlugin(VirtualTourPlugin);

  tour?.addEventListener('node-changed', (event: { node: { id: string } }) => {
    track('scene_changed', { sceneId: event.node.id });
  });

  return {
    destroy: () => {
      viewer.destroy();
    },
  };
}
