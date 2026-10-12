import type { APIRoute } from 'astro';

import en from '../../../locales/en.json';
import { t } from '../lib/i18n';
import { PUBLIC_PAGES } from '../lib/seo';

/**
 * /llms.txt (SEO plan §5.6). Low expectations, written down: no assistant
 * vendor has said it reads this file. It costs nothing, and it says the same
 * one paragraph as every page's Organization block, which is what matters.
 */
export const GET: APIRoute = ({ site, url }) => {
  const origin = site ?? new URL(url.origin);
  const body = [
    `# ${t('common.brand')} (${en.common.brand})`,
    '',
    `> ${t('seo.summary')}`,
    '',
    en.seo.summary,
    '',
    `## ${t('seo.llmsPages')}`,
    '',
    ...PUBLIC_PAGES.map((page) => `- [${page.title()}](${new URL(page.path, origin).href})`),
    '',
    t('seo.llmsPrivacy'),
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
