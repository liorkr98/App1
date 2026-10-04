import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { BASE, LIMITS, measure, medianOf, RESULTS, type Measurement } from './measure';
import { SITE_PAGES, TEMPLATE_PAGES } from './pages';

/**
 * Speed on a cheap phone, per template and per site page (plan §11).
 *
 * REPORT FIRST, BLOCK LATER (decided 4 Oct 2026). Layout shift blocks from
 * day one: it is a property of the markup and barely moves run to run. Load
 * time and long tasks depend on how busy the shared runner is, so for now
 * they are written to the job summary and flagged on the test, not failed.
 * Flip BLOCK_TIMING once a week of numbers shows how far they wander — a
 * check that fails at random is a check people learn to ignore.
 */
const BLOCK_TIMING = false;

const RUNS = 3;

test.describe('speed on a cheap phone', () => {
  for (const page of [...TEMPLATE_PAGES, ...SITE_PAGES]) {
    test(page.name, async ({ browser }) => {
      const runs: Measurement[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        runs.push(await measure(browser, `${BASE}${page.path}`));
      }
      const result = medianOf(runs);
      fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
      fs.appendFileSync(RESULTS, `${JSON.stringify({ name: page.name, result })}\n`);

      const slow: string[] = [];
      if (result.lcp > LIMITS.lcp) slow.push(`LCP ${result.lcp} ms > ${LIMITS.lcp}`);
      if (result.longest > LIMITS.longest) slow.push(`long task ${result.longest} ms > ${LIMITS.longest}`);
      for (const note of slow) test.info().annotations.push({ type: 'slow', description: note });

      expect(result.cls, `${page.name}: the page jumped while loading`).toBeLessThanOrEqual(LIMITS.cls);
      if (BLOCK_TIMING) expect(slow, `${page.name} is slow`).toEqual([]);
    });
  }
});
