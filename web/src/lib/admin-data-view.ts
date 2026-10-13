import {
  compact,
  countTicks,
  delta,
  percent,
  ratio,
  readFunnel,
  shortDay,
  type AdminAnalytics,
  type Range,
  type SeriesRow,
} from '@/features/analytics/admin-data';
import type { Insights } from '@/features/analytics/insights';

import { t } from './i18n';

/**
 * Draws the owner's data page (/admin/data/, 0042) from one admin_analytics
 * answer. The page and its CI fixture (/template-check/admin-data/) both
 * mount this, so the fixture's screenshots are of the code the owner sees.
 *
 * The copy is the server-only `adminData` namespace, handed over by the
 * layout as JSON (web/integrations/client-copy.mjs keeps it out of every
 * other page's bundle). Every number is in a <bdi>; every chart has a table.
 */
type Copy = (typeof import('@locales/he.json'))['adminData'];

export type InsightsAnswer = { insights: Insights } | { error: string };

export interface Mount {
  load: (days: Range) => Promise<AdminAnalytics>;
  ask: (days: Range) => Promise<InsightsAnswer>;
  initial?: Range;
}

/** Validated with the dataviz validator on --plaster (all pairs, light). */
const COLORS = { olive: '#4f7a2a', blue: '#2a78d6', magenta: '#c94f8a' } as const;
const SVG = 'http://www.w3.org/2000/svg';

const readCopy = (): Copy => {
  const node = document.getElementById('admin-data-copy');
  return JSON.parse(node?.textContent ?? '{}') as Copy;
};

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Numbers, dates, hosts and paths read left to right, signs included: −1.7%, not 1.7%−. */
const bdi = (value: string | number) => {
  const node = document.createElement('bdi');
  node.dir = 'ltr';
  node.textContent = typeof value === 'number' ? compact(value) : value;
  return node;
};

/** A message with {slots}; numbers and dates each in their own <bdi>. */
const fill = (message: string, values: Record<string, string | number>): Node[] => {
  const out: Node[] = [];
  let at = 0;
  for (const match of message.matchAll(/\{(\w+)\}/g)) {
    if (match.index > at) out.push(document.createTextNode(message.slice(at, match.index)));
    const value = values[match[1] as string];
    out.push(value === undefined ? document.createTextNode(match[0]) : typeof value === 'number' ? bdi(value) : isWord(value) ? document.createTextNode(value) : bdi(value));
    at = match.index + match[0].length;
  }
  if (at < message.length) out.push(document.createTextNode(message.slice(at)));
  return out;
};

/** Hebrew words go in as text; anything with a digit or Latin goes in a <bdi>. */
const isWord = (value: string) => !/[0-9A-Za-z]/.test(value);

const fillText = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

const minutes = (copy: Copy, value: number | null) =>
  value === null ? null : fill(copy.minutes, { n: value < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value)) });

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

type Cell = string | number | Node | Node[];

const table = (headers: string[], rows: Cell[][], numeric: number[] = []) => {
  const wrap = el('div', 'd-table');
  const grid = el('table');
  const head = grid.createTHead().insertRow();
  headers.forEach((text, index) => {
    const th = el('th', numeric.includes(index) ? 'num' : undefined, text);
    th.scope = 'col';
    head.append(th);
  });
  const body = grid.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((cell, index) => {
      const td = tr.insertCell();
      if (numeric.includes(index)) td.className = 'num';
      if (typeof cell === 'number') td.append(bdi(cell));
      else if (typeof cell === 'string') td.textContent = cell;
      else if (Array.isArray(cell)) td.append(...cell);
      else td.append(cell);
    });
  }
  wrap.append(grid);
  return wrap;
};

const tableView = (copy: Copy, inner: HTMLElement) => {
  const details = el('details', 'd-tableview');
  details.append(el('summary', undefined, copy.tableView), inner);
  return details;
};

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

interface Tile {
  label: string;
  current: number | null;
  previous: number | null;
  /** How to show the value. */
  show: (value: number) => Node[];
  /** Up is good, unless this is false (time to publish). */
  upIsGood?: boolean;
  /** Compare as percentage points rather than a percentage change. */
  points?: boolean;
}

const tile = (copy: Copy, spec: Tile) => {
  const card = el('div', 'kpi');
  card.append(el('span', 'kpi-label', spec.label));
  const value = el('b', 'kpi-value');
  value.append(...(spec.current === null ? [document.createTextNode('—')] : spec.show(spec.current)));
  card.append(value);

  const line = el('span', 'kpi-delta');
  if (spec.current === null || spec.previous === null) {
    line.textContent = copy.noPrevious;
  } else {
    const raw = delta(spec.current, spec.previous);
    // A rate that moved less than a twentieth of a point has not moved.
    const d = spec.points && Math.abs(raw.change) < 0.0005 ? { ...raw, direction: 'flat' as const } : raw;
    const good = d.direction === 'flat' ? null : (d.direction === 'up') === (spec.upIsGood ?? true);
    line.classList.add(good === null ? 'is-flat' : good ? 'is-good' : 'is-bad');
    const arrow = d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '●';
    let amount: string;
    if (d.direction === 'flat') amount = copy.same;
    else if (spec.points) amount = `${d.change > 0 ? '+' : '−'}${percent(Math.abs(d.change))}`;
    else if (d.fraction === null) amount = `+${compact(d.change)}`;
    else amount = `${d.change > 0 ? '+' : '−'}${percent(Math.abs(d.fraction))}`;
    const mark = el('span', 'kpi-arrow', arrow);
    mark.setAttribute('aria-hidden', 'true');
    // The period line above says what this is measured against.
    line.title = copy.vsPrevious;
    line.append(mark, ' ', d.direction === 'flat' ? document.createTextNode(amount) : bdi(amount));
  }
  card.append(line);
  return card;
};

const kpis = (copy: Copy, data: AdminAnalytics) => {
  const c = data.current;
  const p = data.previous;
  const count = (value: number) => [bdi(value)];
  const rate = (value: number) => [bdi(percent(value))];
  const tiles: Tile[] = [
    { label: copy.kpi.visits, current: c.visits, previous: p.visits, show: count },
    { label: copy.kpi.signups, current: c.signups, previous: p.signups, show: count },
    { label: copy.kpi.created, current: c.created, previous: p.created, show: count },
    { label: copy.kpi.published, current: c.published, previous: p.published, show: count },
    { label: copy.kpi.views, current: c.views, previous: p.views, show: count },
    { label: copy.kpi.taps, current: c.taps, previous: p.taps, show: count },
    { label: copy.kpi.contactRate, current: ratio(c.taps, c.views), previous: ratio(p.taps, p.views), show: rate, points: true },
    { label: copy.kpi.readRate, current: ratio(c.reads, c.views), previous: ratio(p.reads, p.views), show: rate, points: true },
    {
      label: copy.kpi.medianPublish,
      current: c.median_minutes_to_publish,
      previous: p.median_minutes_to_publish,
      show: (value) => minutes(copy, value) ?? [],
      upIsGood: false,
    },
    { label: copy.kpi.paywall, current: c.paywall, previous: p.paywall, show: count },
  ];
  const grid = $('d-kpis');
  grid.replaceChildren(...tiles.map((spec) => tile(copy, spec)));
};

// ---------------------------------------------------------------------------
// Line chart: days run from the start side (oldest, the right in RTL) to the
// end side (today), like the agent dashboard. One count axis, never two.
// ---------------------------------------------------------------------------

interface Line {
  key: keyof SeriesRow;
  label: string;
  color: string;
}

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

const lineChart = (copy: Copy, host: HTMLElement, title: string, lines: Line[], rows: SeriesRow[]) => {
  host.replaceChildren();

  const legend = el('ul', 'd-legend');
  for (const line of lines) {
    const item = el('li');
    const key = el('span', 'd-key');
    key.style.background = line.color;
    const total = rows.reduce((sum, row) => sum + Number(row[line.key]), 0);
    item.append(key, `${line.label} · `, bdi(total), ` ${copy.inPeriod}`);
    legend.append(item);
  }
  host.append(legend);

  const frame = el('div', 'd-plot');
  host.append(frame);
  const tip = el('div', 'd-tip');
  tip.hidden = true;
  frame.append(tip);

  const width = Math.max(280, Math.round(frame.clientWidth || host.clientWidth || 640));
  const height = 210;
  const axisRoom = 36;
  const top = 12;
  const bottom = height - 26;
  const start = width - axisRoom;
  const end = 6;
  const n = rows.length;
  const max = Math.max(0, ...rows.flatMap((row) => lines.map((line) => Number(row[line.key]))));
  const { top: ceiling, ticks } = countTicks(max);
  const x = (index: number) => (n > 1 ? start - (index * (start - end)) / (n - 1) : (start + end) / 2);
  const y = (value: number) => bottom - (value / ceiling) * (bottom - top);

  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', tabindex: 0, class: 'd-svg' });
  chart.setAttribute('aria-label', fillText(copy.chartLabel, { title, days: n }));

  for (const tick of ticks) {
    chart.append(svg('line', { x1: end, x2: start, y1: y(tick), y2: y(tick), stroke: 'var(--d-grid)', 'stroke-width': 1 }));
    const label = svg('text', { x: width - 4, y: y(tick) + 4, 'text-anchor': 'end', class: 'd-axis', direction: 'ltr' });
    label.textContent = compact(tick);
    chart.append(label);
  }
  const marks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  for (const index of marks) {
    const row = rows[index];
    if (!row) continue;
    const anchor = index === 0 ? 'end' : index === n - 1 ? 'start' : 'middle';
    const label = svg('text', { x: x(index), y: height - 6, 'text-anchor': anchor, class: 'd-axis', direction: 'ltr' });
    label.textContent = shortDay(row.day);
    chart.append(label);
  }

  for (const line of lines) {
    const points = rows.map((row, index) => `${x(index).toFixed(1)},${y(Number(row[line.key])).toFixed(1)}`);
    chart.append(
      svg('path', {
        d: `M${points.join('L')}`,
        fill: 'none',
        stroke: line.color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }),
    );
    const last = rows[n - 1];
    if (last) {
      chart.append(svg('circle', { cx: x(n - 1), cy: y(Number(last[line.key])), r: 4, fill: line.color, stroke: 'var(--d-surface)', 'stroke-width': 2 }));
    }
  }

  const hair = svg('line', { y1: top, y2: bottom, stroke: 'var(--d-ink-soft)', 'stroke-width': 1, visibility: 'hidden' });
  chart.append(hair);
  const dots = lines.map((line) => {
    const dot = svg('circle', { r: 4, fill: line.color, stroke: 'var(--d-surface)', 'stroke-width': 2, visibility: 'hidden' });
    chart.append(dot);
    return dot;
  });

  let shown = -1;
  const show = (index: number) => {
    const row = rows[index];
    if (!row) return;
    shown = index;
    hair.setAttribute('x1', String(x(index)));
    hair.setAttribute('x2', String(x(index)));
    hair.setAttribute('visibility', 'visible');
    lines.forEach((line, i) => {
      dots[i]?.setAttribute('cx', String(x(index)));
      dots[i]?.setAttribute('cy', String(y(Number(row[line.key]))));
      dots[i]?.setAttribute('visibility', 'visible');
    });
    tip.replaceChildren(el('span', 'd-tip-day'));
    tip.firstElementChild?.append(bdi(shortDay(row.day)));
    for (const line of lines) {
      const item = el('span', 'd-tip-row');
      const key = el('span', 'd-tip-key');
      key.style.background = line.color;
      const value = el('b');
      value.append(bdi(Number(row[line.key])));
      item.append(key, value, ` ${line.label}`);
      tip.append(item);
    }
    tip.hidden = false;
    // Physical x in the SVG; the tip is placed from the inline start (the
    // right edge in RTL), clamped inside the frame.
    const fromStart = width - x(index);
    const tipWidth = tip.offsetWidth || 160;
    const clamped = Math.min(Math.max(fromStart - tipWidth / 2, 0), Math.max(0, width - tipWidth));
    tip.style.insetInlineStart = `${clamped}px`;
  };
  const hide = () => {
    shown = -1;
    hair.setAttribute('visibility', 'hidden');
    for (const dot of dots) dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  chart.addEventListener('pointermove', (event) => {
    const box = chart.getBoundingClientRect();
    const px = ((event.clientX - box.x) / box.width) * width;
    const index = n > 1 ? Math.round(((start - px) / (start - end)) * (n - 1)) : 0;
    show(Math.min(n - 1, Math.max(0, index)));
  });
  chart.addEventListener('pointerleave', hide);
  chart.addEventListener('focus', () => show(n - 1));
  chart.addEventListener('blur', hide);
  chart.addEventListener('keydown', (event) => {
    // Earlier days sit toward the inline start: ArrowRight goes back in RTL.
    if (event.key === 'ArrowRight') show(Math.max(0, (shown < 0 ? n - 1 : shown) - 1));
    else if (event.key === 'ArrowLeft') show(Math.min(n - 1, (shown < 0 ? n - 1 : shown) + 1));
    else return;
    event.preventDefault();
  });
  frame.append(chart);

  host.append(
    tableView(
      copy,
      table(
        [copy.day, ...lines.map((line) => line.label)],
        rows.map((row) => [bdi(shortDay(row.day)), ...lines.map((line) => Number(row[line.key]))]),
        lines.map((_, index) => index + 1),
      ),
    ),
  );
};

// ---------------------------------------------------------------------------
// Where people stop
// ---------------------------------------------------------------------------

const stepName = (step: string) => {
  const name = t(`editor.steps.${step}`);
  return name.startsWith('editor.') ? step : name;
};

const funnel = (copy: Copy, data: AdminAnalytics) => {
  const host = $('d-funnel');
  host.replaceChildren();
  const reading = readFunnel(data.funnel, data.current.editors);

  const summary = el('p', 'd-lead');
  summary.append(...fill(copy.stuckSummary, { editors: reading.editors, finished: reading.finished, stopped: reading.stoppedTotal }));
  host.append(summary);

  if (!reading.worst) {
    host.append(el('p', 'd-empty', copy.stuckNone));
  } else {
    const worst = el('p', 'd-worst');
    worst.append(...fill(copy.stuckWorst, { step: stepName(reading.worst.step), n: reading.worst.stopped, total: reading.stoppedTotal }));
    host.append(worst);

    const max = Math.max(...reading.stops.map((stop) => stop.stopped));
    const bars = el('ol', 'd-bars');
    bars.setAttribute('aria-hidden', 'true');
    for (const stop of reading.stops) {
      const item = el('li', stop.step === reading.worst.step ? 'is-worst' : undefined);
      const name = el('span', 'd-bar-name', stepName(stop.step));
      const track = el('span', 'd-bar-track');
      const fillBar = el('span', 'd-bar-fill');
      fillBar.style.inlineSize = `${Math.max(2, (stop.stopped / max) * 100)}%`;
      track.append(fillBar);
      const value = el('span', 'd-bar-value');
      value.append(bdi(stop.stopped), ' · ', bdi(percent(stop.share)));
      item.append(name, track, value);
      bars.append(item);
    }
    host.append(bars);
  }

  const rows = data.funnel
    .filter((row) => row.entered + row.blocked + row.publish_ok + row.publish_fail + row.stopped > 0)
    .map((row) => [stepName(row.step), row.entered, row.blocked, row.stopped, row.publish_fail]);
  if (rows.length > 0) {
    host.append(tableView(copy, table([copy.colStep, copy.colEntered, copy.colBlocked, copy.colStopped, copy.colFailed], rows, [1, 2, 3, 4])));
  }
};

// ---------------------------------------------------------------------------
// Lists and mixes
// ---------------------------------------------------------------------------

const orEmpty = (copy: Copy, rows: Cell[][], build: () => HTMLElement) => (rows.length > 0 ? build() : el('p', 'd-empty', copy.empty));

const lists = (copy: Copy, data: AdminAnalytics) => {
  const sourceName = (source: string) =>
    source === 'direct' || source === 'internal' ? copy.sourceName[source] : bdi(source);
  const sources = data.top_sources.map((row) => [sourceName(row.source), row.views]);
  $('d-sources').replaceChildren(orEmpty(copy, sources, () => table([copy.colSource, copy.colVisits], sources, [1])));

  const pages = data.top_pages.map((row) => {
    const link = el('a');
    link.href = row.path;
    link.append(bdi(row.path));
    return [link, row.views];
  });
  $('d-pages').replaceChildren(orEmpty(copy, pages, () => table([copy.colPage, copy.colVisits], pages, [1])));

  const listings = data.top_listings.map((row) => {
    const link = el('a');
    link.href = `/a/${row.slug}/`;
    link.append(bdi(row.slug));
    const rate = ratio(row.taps, row.views);
    return [
      link,
      copy.category[row.category as keyof Copy['category']] ?? row.category,
      t(`editor.templates.${row.template}`).startsWith('editor.') ? bdi(row.template) : t(`editor.templates.${row.template}`),
      row.views,
      row.taps,
      rate === null ? '—' : bdi(percent(rate)),
    ];
  });
  $('d-listings').replaceChildren(
    orEmpty(copy, listings, () =>
      table([copy.colListing, copy.colCategory, copy.colTemplate, copy.colViews, copy.colTaps, copy.colRate], listings, [3, 4, 5]),
    ),
  );
};

const mixes = (copy: Copy, data: AdminAnalytics) => {
  const block = (title: string, content: HTMLElement) => {
    const wrap = el('div', 'd-mix');
    wrap.append(el('h3', undefined, title), content);
    return wrap;
  };
  const kinds = data.kinds.map((row) => [copy.kind[row.kind as keyof Copy['kind']] ?? row.kind, row.accounts, row.new]);
  const categories = data.categories.map((row) => [
    copy.category[row.category as keyof Copy['category']] ?? row.category,
    row.created,
    row.published,
  ]);
  const templates = data.templates.map((row) => {
    const name = t(`editor.templates.${row.template}`);
    return [name.startsWith('editor.') ? bdi(row.template) : name, row.published];
  });
  const statuses = Object.entries(data.status).map(([status, count]) => [
    copy.status[status as keyof Copy['status']] ?? status,
    count,
  ]);
  const billing = Object.entries(data.billing).map(([event, count]) => [
    copy.billingEvent[event as keyof Copy['billingEvent']] ?? event,
    count,
  ]);
  $('d-mixes').replaceChildren(
    block(copy.accounts, orEmpty(copy, kinds, () => table([copy.colKind, copy.colAccounts, copy.colNew], kinds, [1, 2]))),
    block(copy.categories, orEmpty(copy, categories, () => table([copy.colCategory, copy.colCreated, copy.colPublished], categories, [1, 2]))),
    block(copy.templates, orEmpty(copy, templates, () => table([copy.colTemplate, copy.colPublished], templates, [1]))),
    block(copy.statusNow, orEmpty(copy, statuses, () => table([copy.colStatus, copy.colCount], statuses, [1]))),
    block(copy.billing, orEmpty(copy, billing, () => table([copy.colEvent, copy.colCount], billing, [1]))),
  );
};

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

const insights = (copy: Copy, answer: InsightsAnswer) => {
  const host = $('d-ai-result');
  host.replaceChildren();
  host.hidden = false;
  if ('error' in answer) {
    const known = copy.aiError[answer.error as keyof Copy['aiError']];
    host.append(el('p', 'd-ai-error', known ?? copy.aiError.unavailable));
    return;
  }
  const { summary, stuck, proposals } = answer.insights;
  host.append(el('p', 'd-ai-note', copy.aiNote));
  host.append(el('h3', undefined, copy.aiSummary), el('p', 'd-ai-summary', summary));
  if (stuck.length > 0) {
    host.append(el('h3', undefined, copy.aiStuck));
    const list = el('ul', 'd-ai-stuck');
    for (const item of stuck) {
      const li = el('li');
      const step = t(`editor.steps.${item.step}`);
      li.append(el('b', undefined, step.startsWith('editor.') ? item.step : step), ' — ', item.evidence);
      list.append(li);
    }
    host.append(list);
  }
  host.append(el('h3', undefined, copy.aiProposals));
  const list = el('ol', 'd-ai-proposals');
  for (const proposal of proposals) {
    const li = el('li', `is-${proposal.impact}`);
    const head = el('div', 'd-ai-head');
    head.append(el('b', undefined, proposal.title), el('span', 'd-ai-impact', copy.impact[proposal.impact]));
    const why = el('p');
    why.append(el('span', 'd-ai-label', copy.aiWhy), ' ', proposal.why);
    const how = el('p');
    how.append(el('span', 'd-ai-label', copy.aiHow), ' ', proposal.how);
    li.append(head, why, how);
    list.append(li);
  }
  host.append(list);
};

// ---------------------------------------------------------------------------

export function mountAdminData({ load, ask, initial = 30 }: Mount): void {
  const copy = readCopy();
  let days: Range = initial;
  let data: AdminAnalytics | null = null;
  let resized = 0;
  let drawnAt = 0;

  /** Gives the browser the main thread back between sections, so a phone draws the page without one long task. */
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  let drawing = 0;
  const draw = async () => {
    const shown = data;
    if (!shown) return;
    const run = ++drawing;
    const steps: (() => void)[] = [
      () => {
        $('d-period').replaceChildren(...fill(copy.period, { from: shortDay(shown.from), to: shortDay(shown.to), n: shown.days }));
        kpis(copy, shown);
      },
      () =>
        lineChart(copy, $('d-traffic'), copy.traffic, [
          { key: 'visits', label: copy.series.visits, color: COLORS.olive },
          { key: 'views', label: copy.series.views, color: COLORS.blue },
        ], shown.series),
      () =>
        lineChart(copy, $('d-growth'), copy.growth, [
          { key: 'signups', label: copy.series.signups, color: COLORS.olive },
          { key: 'created', label: copy.series.created, color: COLORS.blue },
          { key: 'published', label: copy.series.published, color: COLORS.magenta },
        ], shown.series),
      () => funnel(copy, shown),
      () => lists(copy, shown),
      () => mixes(copy, shown),
    ];
    for (const step of steps) {
      // A newer range or a resize started over: stop drawing the old one.
      if (run !== drawing) return;
      step();
      await pause();
    }
  };

  const fetchRange = async () => {
    const body = $('d-body');
    const say = $('d-say');
    body.classList.add('is-loading');
    say.textContent = data ? '' : copy.loading;
    say.hidden = Boolean(data);
    try {
      data = await load(days);
      say.hidden = true;
      $('d-ai-result').hidden = true;
      body.hidden = false;
      drawnAt = $('d-traffic').clientWidth;
      await draw();
    } catch {
      say.textContent = copy.failed;
      say.hidden = false;
    } finally {
      body.classList.remove('is-loading');
    }
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-range]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.range) === days));
    button.addEventListener('click', () => {
      days = Number(button.dataset.range) as Range;
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-range]')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      void fetchRange();
    });
  }

  const aiButton = $('d-ai-button') as HTMLButtonElement;
  aiButton.addEventListener('click', () => {
    void (async () => {
      aiButton.disabled = true;
      const label = aiButton.textContent;
      aiButton.textContent = copy.aiWorking;
      try {
        insights(copy, await ask(days));
      } catch {
        insights(copy, { error: 'unavailable' });
      } finally {
        aiButton.disabled = false;
        aiButton.textContent = label;
      }
    })();
  });

  // Redraw when the charts' column changes width, not on every resize (a
  // scrollbar appearing is one): a redraw replaces the chart under the pointer.
  window.addEventListener('resize', () => {
    window.clearTimeout(resized);
    resized = window.setTimeout(() => {
      const width = $('d-traffic').clientWidth;
      if (Math.abs(width - drawnAt) < 8) return;
      drawnAt = width;
      void draw();
    }, 150);
  });

  void fetchRange();
}
