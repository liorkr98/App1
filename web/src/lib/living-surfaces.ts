import type { TemplateId } from '@/types/listing';

/**
 * Which templates are on the Living Surfaces system (2.0), and in which mode.
 *
 * A template listed here gets data-ls on <html>: the --ls-* tokens, the
 * self-hosted Noto Sans Hebrew display face and the shared motion module
 * (web/src/motion/). A template not listed renders exactly as before, so the
 * system lands one template at a time instead of repainting every page at
 * once.
 *
 * cinema is the P2 proof. P3 moves the templates you keep onto it.
 */
export const LIVING_SURFACES: Partial<Record<TemplateId, 'paper' | 'onyx'>> = {
  cinema: 'onyx',
};

export function livingSurfacesMode(template: TemplateId | undefined): 'paper' | 'onyx' | undefined {
  return template ? LIVING_SURFACES[template] : undefined;
}
