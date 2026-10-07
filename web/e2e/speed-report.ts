import fs from 'node:fs';

import { LIMITS, RESULTS, type Measurement } from './measure';

/**
 * Global teardown: the speed table, once, after every test has run — printed,
 * and written to the GitHub job summary when there is one. Silent when the
 * run measured nothing (a screenshot-only run).
 */
export default function speedReport(): void {
  if (!fs.existsSync(RESULTS)) return;
  const rows = fs
    .readFileSync(RESULTS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { name: string; result: Measurement });
  if (rows.length === 0) return;

  const flag = (over: boolean) => (over ? ' ⚠' : '');
  const table = [
    '### Speed on a cheap phone (4× CPU, Fast 4G, median of 3)',
    '',
    `Limits: LCP ${LIMITS.lcp} ms, CLS ${LIMITS.cls}, longest task ${LIMITS.longest} ms. ` +
      'Layout shift blocks; load time and long tasks are reported only, for now (speed.spec.ts).',
    '',
    '| Page | LCP ms | CLS | Longest task ms |',
    '|---|---:|---:|---:|',
    ...rows.map(
      ({ name, result }) =>
        `| ${name} | ${result.lcp}${flag(result.lcp > LIMITS.lcp)} | ${result.cls}${flag(result.cls > LIMITS.cls)} | ` +
        `${result.longest}${flag(result.longest > LIMITS.longest)} |`,
    ),
    '',
  ].join('\n');

  console.log(`\n${table}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, `${table}\n`);

  /*
   * The same numbers as one check annotation. The job summary above can only
   * be read in the browser; an annotation can be read through the API, so the
   * week of numbers BLOCK_TIMING waits for can actually be collected. One
   * line: an annotation is cut at its first newline.
   */
  if (process.env.GITHUB_ACTIONS) {
    const line = rows.map(({ name, result }) => `${name} ${result.lcp}/${result.longest}/${result.cls}`).join(' | ');
    console.log(`::notice title=Speed (LCP ms/longest task ms/CLS)::${line}`);
  }
}
