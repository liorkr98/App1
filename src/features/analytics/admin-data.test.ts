import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EDITOR_STEPS,
  compact,
  countTicks,
  delta,
  isRange,
  percent,
  ratio,
  readFunnel,
  shortDay,
  type AdminAnalytics,
  type FunnelRow,
  type PeriodTotals,
} from './admin-data.js';
import { INSIGHTS_SYSTEM, insightsInput, parseInsights, readInsights, stepKey, type AskModel } from './insights.js';

const row = (step: string, entered: number, stopped: number, publishOk = 0): FunnelRow => ({
  step,
  entered,
  blocked: 0,
  publish_ok: publishOk,
  publish_fail: 0,
  stopped,
});

describe('delta', () => {
  it('compares with the previous period', () => {
    assert.deepEqual(delta(15, 10), { change: 5, fraction: 0.5, direction: 'up' });
    assert.deepEqual(delta(5, 10), { change: -5, fraction: -0.5, direction: 'down' });
    assert.deepEqual(delta(3, 3), { change: 0, fraction: 0, direction: 'flat' });
  });

  it('has no percentage when the previous period was zero', () => {
    assert.deepEqual(delta(4, 0), { change: 4, fraction: null, direction: 'up' });
  });
});

describe('readFunnel (where people stop)', () => {
  it('finds the step where the most people stopped, ties to the earlier step', () => {
    const funnel = [row('category', 10, 1), row('details', 9, 0), row('photos', 9, 4), row('plate', 3, 4), row('publish', 2, 0, 2)];
    const reading = readFunnel(funnel, 10);
    assert.equal(reading.stoppedTotal, 9);
    assert.equal(reading.finished, 2);
    assert.equal(reading.worst?.step, 'photos');
    assert.equal(reading.stops.length, 3);
    assert.ok(Math.abs((reading.worst?.share ?? 0) - 4 / 9) < 1e-9);
  });

  it('has no worst step when nobody stopped', () => {
    assert.equal(readFunnel([row('category', 2, 0), row('publish', 2, 0, 2)], 2).worst, null);
    assert.equal(readFunnel([], 0).worst, null);
  });
});

describe('number helpers', () => {
  it('divides only by something', () => {
    assert.equal(ratio(1, 4), 0.25);
    assert.equal(ratio(1, 0), null);
  });

  it('gives round axis ticks that reach the maximum', () => {
    assert.deepEqual(countTicks(0), { top: 1, ticks: [0, 1] });
    assert.deepEqual(countTicks(3), { top: 3, ticks: [0, 1, 2, 3] });
    assert.deepEqual(countTicks(37), { top: 40, ticks: [0, 10, 20, 30, 40] });
    const big = countTicks(1234);
    assert.ok(big.top >= 1234 && big.ticks.at(-1) === big.top && big.ticks.length <= 6);
  });

  it('writes numbers and percentages briefly', () => {
    assert.equal(compact(1284), '1,284');
    assert.equal(compact(12_900), '12.9K');
    assert.equal(compact(4_200_000), '4.2M');
    assert.equal(percent(0.4567), '46%');
    assert.equal(percent(0.054), '5.4%');
    assert.equal(percent(0), '0%');
    assert.equal(shortDay('2026-10-03'), '3/10');
  });

  it('knows the ranges and the steps', () => {
    assert.ok(isRange(30) && isRange('7') && !isRange(31));
    assert.equal(EDITOR_STEPS.length, 12);
    assert.equal(stepKey('photos'), 'photos');
    assert.equal(stepKey('תמונות'), null);
  });
});

const totals = (views: number): PeriodTotals => ({
  signups: 4, created: 6, published: 3, publishers: 2, views, taps: 9, reads: 12, shares: 3,
  visits: 140, editors: 5, paywall: 1, payments: 0, median_minutes_to_publish: 7.5,
});

const sample: AdminAnalytics = {
  days: 30, from: '2026-09-14', to: '2026-10-13',
  current: totals(120), previous: totals(80),
  series: [{ day: '2026-10-13', signups: 1, created: 1, published: 1, views: 12, taps: 1, visits: 9 }],
  funnel: [row('category', 5, 1), row('photos', 4, 2), row('publish', 2, 0, 2)],
  status: { draft: 3, published: 3 },
  kinds: [{ kind: 'agent', accounts: 3, new: 2 }],
  categories: [{ category: 'property', created: 5, published: 3 }],
  templates: [{ template: 'aurora', published: 2 }],
  top_listings: [{ slug: 'K7M2Q', category: 'property', template: 'aurora', status: 'published', views: 60, taps: 5, reads: 7 }],
  top_pages: [{ path: '/', views: 90 }],
  top_sources: [{ source: 'google.com', views: 40 }],
  billing: { free_limit_hit: 1 },
};

describe('insightsInput (what DeepSeek is sent)', () => {
  it('carries the aggregates and derived rates', () => {
    const sent = JSON.parse(insightsInput(sample)) as Record<string, Record<string, unknown>>;
    assert.equal(sent.this_period?.views, 120);
    assert.equal(sent.this_period?.contact_rate, 9 / 120);
    assert.equal(sent.previous_period?.views, 80);
    assert.equal(sent.stopped_without_publishing, 3 as unknown as Record<string, unknown>);
  });

  it('does not send listing slugs', () => {
    assert.ok(!insightsInput(sample).includes('K7M2Q'));
  });

  it('asks for JSON in Hebrew', () => {
    assert.match(INSIGHTS_SYSTEM, /JSON/);
    assert.match(INSIGHTS_SYSTEM, /עברית/);
  });
});

describe('parseInsights (the model answer is untrusted)', () => {
  const good = {
    summary: 'רוב האנשים נעצרים בתמונות.',
    stuck: [{ step: 'photos', evidence: '2 מתוך 3 שלא פרסמו עצרו שם' }, { step: '', evidence: 'x' }],
    proposals: [
      { title: 'להקל על העלאת תמונות', why: 'שם נעצרים', how: 'להציע העלאה מהטלפון', impact: 'high' },
      { title: 'בלי סיבה', why: '', how: 'x', impact: 'low' },
      { title: 'השפעה מוזרה', why: 'כי', how: 'ככה', impact: 'huge' },
    ],
  };

  it('keeps well-formed items and drops the rest', () => {
    const parsed = parseInsights(JSON.stringify(good));
    assert.ok(parsed);
    assert.equal(parsed.stuck.length, 1);
    assert.equal(parsed.proposals.length, 2);
    assert.equal(parsed.proposals[1]?.impact, 'medium');
  });

  it('accepts a fenced answer', () => {
    assert.ok(parseInsights('```json\n' + JSON.stringify(good) + '\n```'));
  });

  it('refuses what is not an answer', () => {
    assert.equal(parseInsights('not json'), null);
    assert.equal(parseInsights('[]'), null);
    assert.equal(parseInsights(JSON.stringify({ summary: 'x', proposals: [] })), null);
    assert.equal(parseInsights(JSON.stringify({ proposals: good.proposals })), null);
  });

  it('cuts long text', () => {
    const parsed = parseInsights(JSON.stringify({ ...good, summary: 'א'.repeat(5000) }));
    assert.ok(parsed && parsed.summary.length <= 900);
  });
});

describe('readInsights (the route, with DeepSeek stubbed)', () => {
  const answer = JSON.stringify({
    summary: 'מעט נתונים עדיין.',
    stuck: [],
    proposals: [{ title: 'לשלוח למתווכים', why: '3 הרשמות', how: 'רשימת המתווכים', impact: 'high' }],
  });

  it('sends the system prompt and the aggregates, and returns the parsed answer', async () => {
    let sent = '';
    const result = await readInsights(sample, 'key', async (request) => {
      sent = request.user;
      assert.equal(request.system, INSIGHTS_SYSTEM);
      return { ok: true, content: answer };
    });
    assert.ok(result.ok);
    assert.equal(result.ok && result.insights.proposals[0]?.impact, 'high');
    assert.equal(sent, insightsInput(sample));
  });

  it('names each failure', async () => {
    const never: AskModel = async () => assert.fail('the model must not be called');
    assert.deepEqual(await readInsights(sample, '', never), { ok: false, error: 'no_key' });
    const empty = { ...sample, current: { ...sample.current, visits: 0, views: 0, signups: 0, created: 0, editors: 0 } };
    assert.deepEqual(await readInsights(empty, 'key', never), { ok: false, error: 'no_data' });
    assert.deepEqual(await readInsights(sample, 'key', async () => ({ ok: false, reason: 'timeout' })), { ok: false, error: 'timeout' });
    assert.deepEqual(await readInsights(sample, 'key', async () => ({ ok: false, reason: 'http' })), { ok: false, error: 'unavailable' });
    assert.deepEqual(await readInsights(sample, 'key', async () => ({ ok: true, content: '{"summary":"x"}' })), { ok: false, error: 'malformed' });
  });
});
