import { CATALOGUE } from '@/features/templates/manifest';
import { t } from './i18n';

/**
 * What search engines and AI assistants are told about the product (SEO
 * plan §4, 12 Oct 2026).
 *
 * ONE DESCRIPTION, EVERYWHERE. Assistants recognise an entity when every
 * source agrees on what it is, so the Organization block, the meta
 * description fallback and llms.txt all read `seo.summary` and nothing else.
 *
 * Nothing here is about a listing. A seller's page stays noindex unless they
 * chose otherwise (CLAUDE.md §7), and none of these builders touch one.
 */

/** English name and spellings people search with. */
export const ALTERNATE_NAMES = ['AmudSell', 'Amud Mechira', 'עמוד-מכירה'];

/** The public pages a stranger may land on, for the sitemap and llms.txt. */
export const PUBLIC_PAGES: readonly { path: string; title: () => string }[] = [
  { path: '/', title: () => t('seo.home') },
  { path: '/pricing/', title: () => t('pricing.title') },
  { path: '/agents/', title: () => t('audiences.agents.metaTitle') },
  { path: '/dealers/', title: () => t('audiences.dealers.metaTitle') },
  { path: '/private/', title: () => t('audiences.private.metaTitle') },
  { path: '/templates/', title: () => t('templates.metaTitle') },
  ...CATALOGUE.map((id) => ({ path: `/templates/${id}/`, title: () => t(`editor.templates.${id}`) })),
  { path: '/guide/photos/', title: () => t('guide.photosTitle') },
  { path: '/about/', title: () => t('legal.about') },
  { path: '/contact/', title: () => t('legal.contact') },
  { path: '/legal/terms/', title: () => t('legal.terms') },
  { path: '/legal/privacy/', title: () => t('legal.privacy') },
  { path: '/legal/accessibility/', title: () => t('legal.accessibility') },
];

/** Paths no crawler needs: accounts, the editor, the API, CI fixtures. */
export const PRIVATE_PATHS = [
  '/new/', '/mine/', '/me/', '/enter/', '/up', '/admin/', '/api/', '/preview', '/lab/',
  '/template-check/', '/a/*/share',
];

/**
 * Crawlers that gather text to TRAIN models. They may read the marketing
 * pages (that is how a model comes to know the product), never a listing:
 * an agent who opted a page into Google search did not opt a client's home
 * into a training set. Search and answer crawlers (Googlebot, Bingbot,
 * OAI-SearchBot, Claude-SearchBot, PerplexityBot) fall under `*` and obey
 * each listing's own noindex.
 */
export const TRAINING_CRAWLERS = [
  'GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended',
  'Bytespider', 'meta-externalagent', 'Amazonbot', 'cohere-training-data-crawler',
];

export function robotsTxt(origin: URL): string {
  const disallow = (paths: string[]) => paths.map((path) => `Disallow: ${path}`).join('\n');
  return [
    'User-agent: *',
    'Allow: /',
    disallow(PRIVATE_PATHS),
    '',
    ...TRAINING_CRAWLERS.map((bot) => `User-agent: ${bot}`),
    'Allow: /',
    disallow(['/a/', ...PRIVATE_PATHS]),
    '',
    `Sitemap: ${new URL('/sitemap.xml', origin).href}`,
    '',
  ].join('\n');
}

const absolute = (path: string, origin: URL) => new URL(path, origin).href;

/** The business, the same on every page. */
export function organizationLd(origin: URL) {
  return {
    '@type': 'Organization',
    '@id': absolute('/#organization', origin),
    name: t('common.brand'),
    alternateName: ALTERNATE_NAMES,
    url: absolute('/', origin),
    logo: absolute('/logo-512.png', origin),
    description: t('seo.summary'),
    areaServed: { '@type': 'Country', name: 'Israel' },
  };
}

export function websiteLd(origin: URL) {
  return {
    '@type': 'WebSite',
    '@id': absolute('/#website', origin),
    name: t('common.brand'),
    alternateName: ALTERNATE_NAMES,
    url: absolute('/', origin),
    inLanguage: 'he-IL',
    publisher: { '@id': absolute('/#organization', origin) },
  };
}

/** The product, on the homepage. No offers until prices come from the plans table. */
export function softwareLd(origin: URL) {
  return {
    '@type': 'SoftwareApplication',
    '@id': absolute('/#app', origin),
    name: t('common.brand'),
    alternateName: ALTERNATE_NAMES,
    url: absolute('/', origin),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'he-IL',
    description: t('seo.summary'),
    audience: { '@type': 'BusinessAudience', name: t('seo.audience') },
    publisher: { '@id': absolute('/#organization', origin) },
  };
}

/** One <script type="application/ld+json"> body, as a graph. */
export function ldGraph(nodes: object[]): string {
  // `<` escaped so no string inside can close the script element.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
