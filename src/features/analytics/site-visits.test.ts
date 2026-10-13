import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { normaliseSource, siteViewPath, siteVisitCounts, visitSource } from './site-visits.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('siteViewPath (0042: which pages are site visits)', () => {
  it('stores a page lower case with a trailing slash', () => {
    assert.equal(siteViewPath('/'), '/');
    assert.equal(siteViewPath('/pricing'), '/pricing/');
    assert.equal(siteViewPath('/Guide/Privacy/'), '/guide/privacy/');
    assert.equal(siteViewPath('/templates/heliograph/demo/'), '/templates/heliograph/demo/');
  });

  it('never counts listings, accounts, the editor, the API or fixtures', () => {
    for (const path of ['/a/T4V7A/', '/api/site-view', '/admin/', '/admin/data/', '/me/', '/mine/', '/new/', '/enter/', '/up/', '/lab/film/', '/template-check/agent/', '/preview/']) {
      assert.equal(siteViewPath(path), null, path);
    }
  });

  it('folds an agent page into /agent/, because a handle is often a name', () => {
    assert.equal(siteViewPath('/agent/noa-cohen/'), '/agent/');
    assert.equal(siteViewPath('/agent/K7M2Q'), '/agent/');
  });

  it('refuses anything that is not a plain path', () => {
    for (const path of ['', 'pricing', 'https://evil.example/', '/<x>/', '/a b/', '//x/', '/x/b/c/d/e/', `/${'x'.repeat(81)}`, null, undefined]) {
      assert.equal(siteViewPath(path), null, String(path));
    }
  });

  it('agrees with the database on what is not counted', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/0042_site_analytics.sql', import.meta.url), 'utf8');
    const prefixes = /path ~ '\^\/\(([a-z|-]+)\)\/'/.exec(sql)?.[1]?.split('|') ?? [];
    assert.ok(prefixes.length > 5);
    for (const prefix of prefixes) assert.equal(siteViewPath(`/${prefix}/x/`), null, prefix);
  });
});

describe('visitSource', () => {
  const ownHost = 'amudsell.com';

  it('prefers utm_source', () => {
    assert.equal(visitSource({ utm: 'Newsletter', referrer: 'https://www.google.com/', ownHost }), 'newsletter');
  });

  it('uses the referring host without www', () => {
    assert.equal(visitSource({ referrer: 'https://www.google.co.il/search?q=x', ownHost }), 'google.co.il');
    assert.equal(visitSource({ referrer: 'https://l.facebook.com/l.php?u=x', ownHost }), 'l.facebook.com');
  });

  it('calls our own pages internal and nothing direct', () => {
    assert.equal(visitSource({ referrer: 'https://www.amudsell.com/pricing/', ownHost }), 'internal');
    assert.equal(visitSource({ referrer: '', ownHost }), 'direct');
    assert.equal(visitSource({ referrer: 'not a url', ownHost }), 'direct');
  });

  it('turns an odd source into direct', () => {
    assert.equal(normaliseSource('Bad Source!'), 'direct');
    assert.equal(normaliseSource('x'.repeat(41)), 'direct');
    assert.equal(normaliseSource(' WhatsApp '), 'whatsapp');
  });
});

describe('siteVisitCounts', () => {
  it('counts a person', () => {
    assert.equal(siteVisitCounts({ userAgent: IPHONE, cookie: null }), true);
  });

  it('does not count the signed-in owner or automation', () => {
    assert.equal(siteVisitCounts({ userAgent: IPHONE, cookie: 'x=1; amud_owner=1' }), false);
    assert.equal(siteVisitCounts({ userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)', cookie: null }), false);
    assert.equal(siteVisitCounts({ userAgent: 'Mozilla/5.0 HeadlessChrome/120', cookie: null }), false);
  });
});
