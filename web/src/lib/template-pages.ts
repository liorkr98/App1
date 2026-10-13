import type { Listing, TemplateId } from '@/types/listing';
import { CATALOGUE, templateFits } from '@/features/templates/manifest';
import { golfListing, tlvListing } from './fixtures';

/**
 * The public template pages (/templates/, /templates/{id}/ and its demo):
 * one entry per catalogue template, in the order the picker offers them.
 *
 * The example listing is the Tel Aviv flat unless the design is drawn only
 * for cars, in which case it is the Golf — a template shown on the wrong
 * category would render as its fallback and show a different design.
 */
export interface TemplateExample {
  id: TemplateId;
  forHomes: boolean;
  forCars: boolean;
  listing: Listing;
}

export function templateExamples(): TemplateExample[] {
  return CATALOGUE.map((id) => {
    const forHomes = templateFits(id, 'property');
    const forCars = templateFits(id, 'vehicle');
    const base = forHomes ? tlvListing : golfListing;
    return { id, forHomes, forCars, listing: { ...base, template: id } };
  });
}

/** "For homes", "for cars" or both, as a locale key. */
export function fitsKey(example: Pick<TemplateExample, 'forHomes' | 'forCars'>): string {
  if (example.forHomes && example.forCars) return 'templates.forBoth';
  return example.forHomes ? 'templates.forHomes' : 'templates.forCars';
}

export const templatePath = (id: TemplateId) => `/templates/${id}/`;
export const demoPath = (id: TemplateId) => `/templates/${id}/demo/`;
export const buildPath = (id: TemplateId) => `/new/?fresh=1&template=${id}`;
