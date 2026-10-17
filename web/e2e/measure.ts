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
  /**
   * The three largest shifts, each as "0.0680 at 4532 ms: SPAN.hm-room
   * y0→794". A failing CLS used to say only that the page jumped; on 16 Oct
   * 2026 the homepage failed in CI at 0.1142 and measured 0 on every
   * machine that could be asked, so the runner has to say what moved.
   */
  shifts?: string[];
  /**
   * What the longest frame was busy with, as "312 ms frame: style and layout
   * 270 ms, script 18 ms (listing-enhance)". On 17 Oct 2026 the zine and
   * ticket listings failed once in CI at 212 and 237 ms and passed on the
   * next runs; a trace showed the first layout of the whole page, not script.
   * Read from long-animation-frame timing where the browser has it.
   */
  longestCause?: string;
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
      const m = {
        lcp: 0,
        cls: 0,
        longest: 0,
        longestAt: 0,
        moved: [] as { value: number; text: string }[],
        frames: [] as { start: number; end: number; text: string }[],
      };
      window.__speed = m;
      const name = (node: Node | null) => {
        if (!node) return '?';
        if (!(node instanceof Element)) return `text "${(node.textContent ?? '').trim().slice(0, 24)}"`;
        return [node.tagName.toLowerCase(), ...[...node.classList].slice(0, 3)].join('.');
      };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) m.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
        })[]) {
          if (entry.hadRecentInput) continue;
          m.cls += entry.value;
          // Only shifts worth naming are described; the rest cost nothing.
          if (entry.value < 0.001) continue;
          const what = (entry.sources ?? [])
            .map((source) => {
              const from = source.previousRect;
              const to = source.currentRect;
              return `${name(source.node)} y${Math.round(from.y)}→${Math.round(to.y)} h${Math.round(from.height)}→${Math.round(to.height)}`;
            })
            .join(', ');
          m.moved.push({ value: entry.value, text: `${entry.value.toFixed(4)} at ${Math.round(entry.startTime)} ms: ${what}` });
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration <= m.longest) continue;
          m.longest = entry.duration;
          m.longestAt = entry.startTime;
        }
      }).observe({ type: 'longtask', buffered: true });
      if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            styleAndLayoutStart: number;
            scripts: { duration: number; sourceURL: string; invoker: string }[];
          })[]) {
            const end = entry.startTime + entry.duration;
            const layout = entry.styleAndLayoutStart > 0 ? end - entry.styleAndLayoutStart : 0;
            const scripts = [...entry.scripts].sort((a, b) => b.duration - a.duration);
            const script = scripts.reduce((sum, run) => sum + run.duration, 0);
            const top = scripts[0];
            const where = top ? ` (${(top.sourceURL.split('/').pop() ?? '').split('.')[0] || top.invoker})` : '';
            m.frames.push({
              start: entry.startTime,
              end,
              text: `${Math.round(entry.duration)} ms frame: style and layout ${Math.round(layout)} ms, script ${Math.round(script)} ms${where}`,
            });
          }
        }).observe({ type: 'long-animation-frame', buffered: true });
      }
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
    const moved = (result as { moved?: { value: number; text: string }[] }).moved ?? [];
    // The frame that holds the longest task. The first frame of a load spans
    // the whole wait for it, so the longest frame is not the one to name.
    const { frames = [], longestAt = 0 } = result as { frames?: { start: number; end: number; text: string }[]; longestAt?: number };
    const cause = frames.find((frame) => frame.start <= longestAt + 1 && longestAt < frame.end)?.text;
    return {
      lcp: Math.round(result.lcp),
      cls: Number(result.cls.toFixed(4)),
      longest: Math.round(result.longest),
      shifts: [...moved].sort((a, b) => b.value - a.value).slice(0, 3).map((shift) => shift.text),
      ...(cause ? { longestCause: cause } : {}),
    };
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
  const cls = mid(runs.map((run) => run.cls));
  // The shifts of the run whose CLS is closest to the median: the one the
  // number describes.
  const closest = [...runs].sort((a, b) => Math.abs(a.cls - cls) - Math.abs(b.cls - cls))[0];
  const longest = mid(runs.map((run) => run.longest));
  // Likewise the cause from the run whose longest task is nearest the median.
  const typical = [...runs].sort((a, b) => Math.abs(a.longest - longest) - Math.abs(b.longest - longest))[0];
  return {
    lcp: mid(runs.map((run) => run.lcp)),
    cls,
    longest,
    ...(closest?.shifts?.length ? { shifts: closest.shifts } : {}),
    ...(typical?.longestCause ? { longestCause: typical.longestCause } : {}),
  };
}
