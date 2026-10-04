import path from 'node:path';

import type { Browser, Page } from '@playwright/test';

/**
 * One cold load of a page as a cheap phone sees it, measured in the page.
 *
 * The profile (plan §11): CPU slowed 4× and Fast 4G (150 ms latency,
 * ~1.6 Mbps down). A fresh browser context each time, so nothing is cached —
 * a buyer opening a WhatsApp link has never seen the page before.
 *
 *   lcp      largest-contentful-paint, ms: when the main picture or title
 *            landed. Read after load settles; that is the candidate the
 *            browser would report.
 *   cls      sum of layout shifts without recent input: how far the page
 *            jumped while loading. The number a buyer feels as "it moved
 *            under my thumb".
 *   longest  the longest main-thread task, ms: how long a tap could go
 *            unanswered.
 */
export interface Measurement {
  lcp: number;
  cls: number;
  longest: number;
}

export const PHONE = { width: 390, height: 844 };

/** Plan §11's limits. Which of them block is decided in speed.spec.ts. */
export const LIMITS = { lcp: 2_000, cls: 0.05, longest: 200 } as const;

export const BASE = 'http://127.0.0.1:8099';

/**
 * Each speed result goes to this file as it is measured; speed-report.ts
 * turns it into the table once every test is done. Not an afterAll: a
 * failing test restarts its worker, and an in-memory list came out in pieces.
 * Inside outputDir, which Playwright empties at the start of every run.
 */
export const RESULTS = path.join(process.cwd(), 'test-results', 'speed.jsonl');

const FAST_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

/** After `load`, how long late shifts and a late LCP candidate get to land. */
const SETTLE_MS = 2_000;

declare global {
  interface Window {
    __speed?: Measurement;
  }
}

export async function measure(
  browser: Browser,
  url: string,
  prepare?: (page: Page) => Promise<void>,
): Promise<Measurement> {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'he-IL',
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const m = { lcp: 0, cls: 0, longest: 0 };
      window.__speed = m;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) m.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) m.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) m.longest = Math.max(m.longest, entry.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    if (prepare) await prepare(page);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', FAST_4G);

    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(SETTLE_MS);
    const result = await page.evaluate(() => window.__speed);
    if (!result) throw new Error(`no measurement for ${url}`);
    return { lcp: Math.round(result.lcp), cls: Number(result.cls.toFixed(4)), longest: Math.round(result.longest) };
  } finally {
    await context.close();
  }
}

/** The median of each number across runs, so one noisy load does not decide. */
export function medianOf(runs: readonly Measurement[]): Measurement {
  const mid = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const half = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2;
  };
  return {
    lcp: mid(runs.map((run) => run.lcp)),
    cls: mid(runs.map((run) => run.cls)),
    longest: mid(runs.map((run) => run.longest)),
  };
}
