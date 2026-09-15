/**
 * Where the agency mark sits on a published page.
 *
 * Four presets, not freeform CSS. An agent who can paste rules can break
 * contrast, cover a face, and ship a page that is no longer ours. The
 * watermark is a static corner at capped opacity — not ML, not "never on
 * faces" by detection, just out of the way of the photograph's centre.
 */
export const LOGO_PLACEMENTS = ['bar', 'barWide', 'footerOnly', 'watermark'] as const;

export type LogoPlacement = (typeof LOGO_PLACEMENTS)[number];

export const DEFAULT_LOGO_PLACEMENT: LogoPlacement = 'bar';

export function isLogoPlacement(value: unknown): value is LogoPlacement {
  return (LOGO_PLACEMENTS as readonly string[]).includes(String(value));
}

export function asLogoPlacement(value: unknown): LogoPlacement {
  return isLogoPlacement(value) ? value : DEFAULT_LOGO_PLACEMENT;
}
