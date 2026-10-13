import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OWNER_COOKIE, countCookieName, isAutomated, shouldCount, type CountRequest } from './count-rules.js';
import { series, totals, type DailyRow } from './dashboard-stats.js';
import { PAGE_ROWS, fetchAll } from './paging.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const base: CountRequest = {
  method: 'GET',
  userAgent: IPHONE,
  secPurpose: null,
  purpose: null,
  cookie: null,
  slug: 'K7M2Q',
  kind: 'view',
};

describe('shouldCount (13 Oct: views that are people)', () => {
  it('counts a person opening the page, and sets the 30-minute cookie', () => {
    const decision = shouldCount(base);
    assert.equal(decision.count, true);
    assert.match(decision.setCookie ?? '', /^av_K7M2Q=1; Max-Age=1800; Path=\/a\/K7M2Q; SameSite=Lax; Secure; HttpOnly$/);
  });

  it('does not count the same browser again within 30 minutes', () => {
    assert.equal(shouldCount({ ...base, cookie: `x=1; ${countCookieName('view', 'K7M2Q')}=1` }).count, false);
    assert.equal(shouldCount({ ...base, cookie: 'av_OTHER=1' }).count, true);
  });

  it('keeps views and WhatsApp taps apart', () => {
    assert.equal(shouldCount({ ...base, kind: 'wa', cookie: 'av_K7M2Q=1' }).count, true);
    assert.match(shouldCount({ ...base, kind: 'wa' }).setCookie ?? '', /^aw_K7M2Q=1/);
  });

  it("never counts the agent's own browser", () => {
    assert.equal(shouldCount({ ...base, cookie: `${OWNER_COOKIE}=1` }).count, false);
  });

  it('never counts a prefetch, a prerender or a HEAD', () => {
    assert.equal(shouldCount({ ...base, secPurpose: 'prefetch;prerender' }).count, false);
    assert.equal(shouldCount({ ...base, purpose: 'prefetch' }).count, false);
    assert.equal(shouldCount({ ...base, method: 'HEAD' }).count, false);
  });

  it('never counts automation', () => {
    for (const ua of [
      'WhatsApp/2.23.20.0',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/125.0 Safari/537.36',
      'curl/8.5.0',
      'python-requests/2.32.3',
      'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
    ]) {
      assert.equal(isAutomated(ua), true, ua);
      assert.equal(shouldCount({ ...base, userAgent: ua }).count, false, ua);
    }
  });

  it('counts people in in-app browsers, and a missing user agent', () => {
    for (const ua of [
      IPHONE,
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 341.0.0',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0;]',
      // A phone brand with "bot" in its name is a person.
      'Mozilla/5.0 (Linux; Android 12; Cubot X30 Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    ]) {
      assert.equal(isAutomated(ua), false, ua);
    }
    assert.equal(shouldCount({ ...base, userAgent: null }).count, true);
  });
});

describe('fetchAll (13 Oct: the dashboard stopped at 1000 rows)', () => {
  const rows = (count: number): DailyRow[] =>
    Array.from({ length: count }, (_, index) => ({
      listing_id: `L${index % 40}`,
      day: '2026-10-01',
      views: 1,
      wa_taps: index % 2,
    }));

  it('reads every page until a short one', async () => {
    const all = rows(2345);
    const asked: [number, number][] = [];
    const result = await fetchAll<DailyRow>(async (from, to) => {
      asked.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    assert.equal(result.data?.length, 2345);
    assert.deepEqual(asked[1], [PAGE_ROWS, 2 * PAGE_ROWS - 1]);
    const sum = totals(series(result.data ?? [], ['2026-10-01']));
    assert.deepEqual(sum, { views: 2345, taps: 1172 });
  });

  it('asks one more page when the total is an exact multiple', async () => {
    let calls = 0;
    const all = rows(PAGE_ROWS);
    const result = await fetchAll<DailyRow>(async (from, to) => {
      calls += 1;
      return { data: all.slice(from, to + 1), error: null };
    });
    assert.equal(result.data?.length, PAGE_ROWS);
    assert.equal(calls, 2);
  });

  it('passes an error through rather than returning part of the rows', async () => {
    const result = await fetchAll<DailyRow>(async (from) => (from === 0 ? { data: rows(PAGE_ROWS), error: null } : { data: null, error: 'boom' }));
    assert.equal(result.data, null);
    assert.equal(result.error, 'boom');
  });
});
