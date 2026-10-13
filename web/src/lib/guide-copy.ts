import { guideBySlug, type GuideSlug } from '@/features/guides/guides';
import { t } from './i18n';

/**
 * A guide's title and lead. The photo guide keeps its older guide.* keys
 * (it predates the table); the rest are guides.{slug}.*.
 */
export const guideTitle = (slug: GuideSlug) =>
  slug === 'photos' ? t('guide.photosTitle') : t(`guides.${slug}.title`);

export const guideLead = (slug: GuideSlug) =>
  slug === 'photos' ? t('guide.photosLead') : t(`guides.${slug}.lead`);

export interface GuideSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

/** The sections guides.ts declares, read from guides.{slug}.sN / sNTitle. */
export function guideSections(slug: Exclude<GuideSlug, 'photos'>): GuideSection[] {
  return guideBySlug(slug).sections.map((kind, index) => {
    const body = t(`guides.${slug}.s${index + 1}`);
    const title = t(`guides.${slug}.s${index + 1}Title`);
    return kind === 'list' ? { title, items: body.split('\n') } : { title, paragraphs: body.split('\n\n') };
  });
}

/** 2026-10-13 → 13.10.2026, the way a date is read here. */
export const guideDate = (iso: string) => iso.split('-').reverse().join('.');
