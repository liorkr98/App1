import type { TemplateId } from '@/types/listing';
import { templateSpec } from '@/features/templates/manifest';

/**
 * Which Living Surfaces mode (2.0) a template is on, if any.
 *
 * A template with a mode gets data-ls on <html>: the --ls-* tokens, the
 * self-hosted Noto Sans Hebrew display face and the shared motion module
 * (web/src/motion/). A template without one renders exactly as before, so the
 * system lands one template at a time instead of repainting every page at
 * once. The table itself is TEMPLATE_MANIFEST (src/features/templates).
 */
export function livingSurfacesMode(template: TemplateId | undefined): 'paper' | 'onyx' | undefined {
  return template ? templateSpec(template).ls : undefined;
}
