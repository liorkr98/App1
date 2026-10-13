import type { TemplateId } from '../../types/listing.js';

/**
 * The guides (SEO plan, phase 4), in one table: the hub at /guide/, the
 * sitemap, each guide's related links and the audience pages all read it.
 *
 *   sections   how many `sNTitle`/`sN` pairs guides.{slug} has in
 *              locales/he.json, and which are lists (one item per line)
 *              rather than paragraphs (split on a blank line).
 *   template   the live example a guide points to.
 *   audience   the product page a guide points to.
 *   shownOn    the product pages that list it.
 *
 * `photos` predates the table: its copy is the older guide.* keys and its
 * page builds its own sections.
 *
 * AUTHOR. The brand, until the owner names a person (13 Oct 2026). A named
 * author is a change to GUIDE_AUTHOR and nothing else.
 */
export type Audience = 'agents' | 'dealers' | 'private';
export type GuideSlug = 'photos' | 'description' | 'car-photos' | 'car-listing' | 'privacy';

export interface Guide {
  slug: GuideSlug;
  category: 'property' | 'vehicle';
  sections: readonly ('text' | 'list')[];
  template: TemplateId;
  audience: Audience;
  shownOn: readonly Audience[];
  published: string;
  updated: string;
}

export const GUIDE_AUTHOR = 'organization' as const;

export const GUIDES: readonly Guide[] = [
  {
    slug: 'photos',
    category: 'property',
    sections: [],
    template: 'aurora',
    audience: 'agents',
    shownOn: ['agents', 'private'],
    published: '2026-09-23',
    updated: '2026-10-13',
  },
  {
    slug: 'description',
    category: 'property',
    sections: ['text', 'list', 'text', 'text', 'text', 'text', 'list', 'text'],
    template: 'atelier',
    audience: 'agents',
    shownOn: ['agents'],
    published: '2026-10-13',
    updated: '2026-10-13',
  },
  {
    slug: 'privacy',
    category: 'property',
    sections: ['text', 'text', 'list', 'text', 'text', 'text', 'text'],
    template: 'streetsign',
    audience: 'private',
    shownOn: ['private'],
    published: '2026-10-13',
    updated: '2026-10-13',
  },
  {
    slug: 'car-photos',
    category: 'vehicle',
    sections: ['list', 'list', 'text', 'text', 'text', 'text', 'text', 'text'],
    template: 'showroom',
    audience: 'dealers',
    shownOn: ['dealers'],
    published: '2026-10-13',
    updated: '2026-10-13',
  },
  {
    slug: 'car-listing',
    category: 'vehicle',
    sections: ['list', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
    template: 'dossier',
    audience: 'dealers',
    shownOn: ['dealers'],
    published: '2026-10-13',
    updated: '2026-10-13',
  },
];

export const guidePath = (slug: GuideSlug) => `/guide/${slug}/`;

export function guideBySlug(slug: GuideSlug): Guide {
  const guide = GUIDES.find((candidate) => candidate.slug === slug);
  if (!guide) throw new Error(`No guide ${slug}`);
  return guide;
}

/** Up to two other guides, the same category first. */
export function relatedGuides(slug: GuideSlug): Guide[] {
  const self = guideBySlug(slug);
  const others = GUIDES.filter((guide) => guide.slug !== slug);
  return [
    ...others.filter((guide) => guide.category === self.category),
    ...others.filter((guide) => guide.category !== self.category),
  ].slice(0, 2);
}

export const guidesFor = (audience: Audience): Guide[] =>
  GUIDES.filter((guide) => guide.shownOn.includes(audience));
