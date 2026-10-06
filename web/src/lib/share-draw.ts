import type { Listing } from '@/types/listing';
import { accentFor } from '@/features/agents/accents';
import { coverCrop, fitSize, wrapLines, type Measure } from '@/features/listings/card-layout';
import { ogPriceFragment } from '@/features/listings/control-surface';
import { cardFamily, type CardFamily } from '@/features/listings/share-card';
import { templateFor, templateSpec } from '@/features/templates/manifest';

import { toCells } from './facts';
import { ils } from './format';
import { t } from './i18n';
import { stagePlace, titleLines } from './stage';

/**
 * The WhatsApp card (1200 × 630) and the story image (1080 × 1920), drawn on
 * a canvas in the agent's own browser.
 *
 * WHY A CANVAS. These were Puppeteer screenshots of ShareCard.astro and
 * /a/{slug}/story on a Fly.io worker. Fly is gone — it cost more than the
 * product earns — and a phone cannot screenshot HTML. So the two layouts are
 * drawn again here, family by family, from the same numbers: the same boxes,
 * sizes and colours as ShareCard.astro and story.astro. A change to either
 * of those should be carried here, and the other way round.
 *
 * The same rules as the page hold. Every number is drawn as its own run with
 * its own direction (the canvas equivalent of <bdi>), the plate is not a fact
 * and cannot appear, the price follows its display mode, and nothing claims
 * "verified".
 *
 * Coordinates: the card is always Hebrew, so boxes are given from the
 * inline-start edge, which is the RIGHT edge (`start`), and converted once in
 * `fromStart`.
 */

const DISPLAY = '"Noto Sans Hebrew", "Heebo", system-ui, sans-serif';
const BODY = '"Heebo", "Assistant", system-ui, sans-serif';
const SERIF = '"Frank Ruhl Libre", "Times New Roman", serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Heebo", monospace';

interface Palette {
  ground: string;
  ink: string;
  ink2: string;
  line: string;
}

const PAPER: Palette = { ground: '#f6f4ef', ink: '#121310', ink2: '#5e5f57', line: 'rgba(18, 19, 16, 0.1)' };
const ONYX: Palette = { ground: '#0b0c0a', ink: '#f2f0ea', ink2: '#a7a89c', line: 'rgba(242, 240, 234, 0.12)' };

/** What both images print, computed once and the same way the pages do. */
interface Content {
  family: CardFamily;
  serif: boolean;
  storyMode: 'paper' | 'onyx';
  accent: { base: string; lift: string };
  place: string;
  title: string;
  titleLines: string[];
  price: string;
  cells: { label: string; value: string; isolated: boolean }[];
  name: string;
  role: string;
  licence?: string;
  category: Listing['category'];
}

export function shareContent(listing: Listing): Content {
  const template = templateFor(listing.template, listing.category);
  const cells = toCells(listing.category, listing.facts, listing.audience)
    .filter((cell) => !cell.absent)
    .slice(0, 3)
    .map((cell) => ({ label: cell.label, value: cell.displayValue, isolated: Boolean(cell.bdi) }));
  return {
    family: cardFamily(template),
    serif: template === 'atelier',
    storyMode: templateSpec(listing.template).ls ?? 'onyx',
    accent: accentFor(listing.accent),
    place: stagePlace(listing),
    title: listing.title.replace(/\s*\n\s*/g, ' '),
    titleLines: titleLines(listing),
    // ogPriceFragment is written for og:title ("… · ₪x"); the separator is not ours.
    price: ogPriceFragment(listing.price, listing.priceDisplay, ils(listing.price), t('listing.priceFrom')).replace(/^[\s·]+/, ''),
    cells,
    name: listing.seller.name,
    role: listing.seller.agencyName ?? listing.seller.role ?? '',
    ...(listing.seller.licenceNumber ? { licence: listing.seller.licenceNumber } : {}),
    category: listing.category,
  };
}

/** Every face the drawings use, loaded before the first measurement. */
export async function loadShareFonts(timeoutMs = 4000): Promise<void> {
  if (!('fonts' in document)) return;
  const sample = 'אבגדה ₪0123456789';
  const faces = [
    `800 72px ${DISPLAY}`,
    `700 40px ${DISPLAY}`,
    `400 24px ${BODY}`,
    `700 24px ${BODY}`,
    `900 72px ${BODY}`,
    `700 60px ${SERIF}`,
  ];
  await Promise.race([
    Promise.all(faces.map((face) => document.fonts.load(face, sample).catch(() => []))),
    new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

/** The cover, readable by the canvas (Supabase Storage answers CORS with *). */
export function loadCover(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('cover'));
    image.src = url;
  });
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

interface Box {
  /** From the inline-start edge. */
  start: number;
  top: number;
  width: number;
  height: number;
}

function fromStart(canvasWidth: number, box: Box) {
  return { x: canvasWidth - box.start - box.width, y: box.top, w: box.width, h: box.height };
}

/** `font-stretch`, where the canvas supports it (not every Safari does). */
function stretch(ctx: Ctx, value: 'normal' | 'condensed' | 'extra-condensed') {
  if ('fontStretch' in ctx) (ctx as Ctx & { fontStretch: string }).fontStretch = value;
}

function measureWith(ctx: Ctx, font: string): Measure {
  return (text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/**
 * One run of text, its start at `edge` and its middle at `y`.
 * `isolated` draws it left-to-right as its own run — the canvas's <bdi> —
 * so "3 / 5" and "₪4,250,000" keep their order inside a Hebrew line.
 */
function run(ctx: Ctx, text: string, edge: number, y: number, isolated = false) {
  ctx.direction = isolated ? 'ltr' : 'rtl';
  ctx.textAlign = isolated ? 'end' : 'start';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, edge, y);
}

/** Draws the cover into a box like `object-fit: cover`. */
function photo(ctx: Ctx, image: HTMLImageElement, x: number, y: number, w: number, h: number, focal?: { x?: number; y?: number }) {
  const crop = coverCrop(image.naturalWidth, image.naturalHeight, w, h, focal?.x, focal?.y);
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, x, y, w, h);
}

/** The cover in one grey ink, contrast lifted: Poster and Zine's prints. */
function greyPhoto(image: HTMLImageElement, w: number, h: number, contrast: number, focal?: { x?: number; y?: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  photo(ctx, image, 0, 0, w, h, focal);
  const pixels = ctx.getImageData(0, 0, w, h);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const grey = 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
    const value = Math.max(0, Math.min(255, (grey - 128) * contrast + 128));
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function rotated(ctx: Ctx, x: number, y: number, w: number, h: number, degrees: number, draw: () => void) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  draw();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The text column, shared by every card family and the story
// ---------------------------------------------------------------------------

interface Piece {
  height: number;
  draw: (edge: number, top: number) => void;
}

function stack(pieces: readonly Piece[], gap: number) {
  return pieces.reduce((sum, piece) => sum + piece.height, 0) + gap * Math.max(0, pieces.length - 1);
}

function drawStack(pieces: readonly Piece[], edge: number, top: number, gap: number) {
  let y = top;
  for (const piece of pieces) {
    piece.draw(edge, y);
    y += piece.height + gap;
  }
}

function linesPiece(ctx: Ctx, lines: readonly string[], font: string, color: string, lineHeight: number, fontStretch: 'normal' | 'condensed' | 'extra-condensed' = 'normal'): Piece {
  return {
    height: lines.length * lineHeight,
    draw: (edge, top) => {
      ctx.font = font;
      stretch(ctx, fontStretch);
      ctx.fillStyle = color;
      lines.forEach((line, index) => run(ctx, line, edge, top + lineHeight * (index + 0.5)));
      stretch(ctx, 'normal');
    },
  };
}

function cellsPiece(
  ctx: Ctx,
  cells: Content['cells'],
  value: { font: string; size: number; color: string },
  label: { font: string; size: number; color: string },
  gap: number,
  rule?: { color: string; width: number; pad: number },
): Piece {
  const valueHeight = value.size * 1.05;
  const labelHeight = label.size * 1.5;
  const lead = rule ? rule.width + rule.pad : 0;
  return {
    height: lead + valueHeight + 2 + labelHeight,
    draw: (edge, top) => {
      if (rule) {
        ctx.fillStyle = rule.color;
        // The rule spans the whole row, so it is measured first.
        let span = 0;
        for (const cell of cells) {
          span += Math.max(measureWith(ctx, value.font)(cell.value), measureWith(ctx, label.font)(cell.label)) + gap;
        }
        ctx.fillRect(edge - Math.max(0, span - gap), top, Math.max(0, span - gap), rule.width);
      }
      let x = edge;
      for (const cell of cells) {
        const width = Math.max(measureWith(ctx, value.font)(cell.value), measureWith(ctx, label.font)(cell.label));
        ctx.font = value.font;
        ctx.fillStyle = value.color;
        run(ctx, cell.value, x, top + lead + valueHeight / 2, cell.isolated);
        ctx.font = label.font;
        ctx.fillStyle = label.color;
        run(ctx, cell.label, x, top + lead + valueHeight + 2 + labelHeight / 2);
        x -= width + gap;
      }
    },
  };
}

/** "Name · Agency": the name bold in ink, the rest in the quiet ink. */
function agentPiece(ctx: Ctx, content: Content, size: number, palette: Palette, extra?: string): Piece {
  const lineHeight = size * 1.5;
  return {
    height: lineHeight,
    draw: (edge, top) => {
      const y = top + lineHeight / 2;
      const bold = `700 ${size}px ${BODY}`;
      ctx.font = bold;
      ctx.fillStyle = palette.ink;
      run(ctx, content.name, edge, y);
      const rest = [content.role, extra].filter(Boolean).join(' · ');
      if (!rest) return;
      const used = measureWith(ctx, bold)(content.name);
      ctx.font = `400 ${size}px ${BODY}`;
      ctx.fillStyle = palette.ink2;
      run(ctx, ` · ${rest}`, edge - used, y);
    },
  };
}

// ---------------------------------------------------------------------------
// The card, 1200 × 630
// ---------------------------------------------------------------------------

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

interface CardLook {
  palette: Palette;
  textBox: Box;
  /** Where the column sits in its box: at the bottom (most), or the top (ticket). */
  align: 'end' | 'start';
  titleFont: (size: number) => string;
  titleStretch: 'normal' | 'condensed' | 'extra-condensed';
  titleScale: number;
  titleLineHeight: number;
  titleColor: string;
  priceColor: string;
  showPrice: boolean;
  cellValueFont: (size: number) => string;
  cellValueSize: number;
  cellValueColor: string;
  rule?: { color: string; width: number; pad: number };
}

function cardLook(content: Content): CardLook {
  const { family, accent } = content;
  const palette =
    family === 'night'
      ? ONYX
      : family === 'poster'
        ? { ...PAPER, ground: '#eeece5', ink: '#16170f' }
        : family === 'zine'
          ? { ...PAPER, ground: '#f4efe6', ink: '#16305a', ink2: '#3f4d68' }
          : family === 'dossier'
            ? { ...PAPER, ground: '#e9dcc0', ink: '#1f1d18' }
            : family === 'ticket'
              ? { ...PAPER, ground: '#e8e4da', ink: '#15140f' }
              : PAPER;
  const display = (size: number) => `800 ${size}px ${DISPLAY}`;
  const base: CardLook = {
    palette,
    textBox: { start: 64, top: 56, width: 520, height: CARD_HEIGHT - 112 },
    align: 'end',
    titleFont: content.serif ? (size) => `700 ${size}px ${SERIF}` : display,
    titleStretch: content.serif ? 'normal' : 'condensed',
    titleScale: 1,
    titleLineHeight: content.serif ? 1.12 : 1.02,
    titleColor: palette.ink,
    priceColor: accent.base,
    showPrice: true,
    cellValueFont: (size) => `700 ${size}px ${DISPLAY}`,
    cellValueSize: 40,
    cellValueColor: palette.ink,
  };
  switch (family) {
    case 'night':
      return { ...base, textBox: { ...base.textBox, width: 600 }, priceColor: accent.lift };
    case 'paper':
      return base;
    case 'blueprint':
      return {
        ...base,
        textBox: { ...base.textBox, width: 540 },
        titleColor: '#1f4fa0',
        cellValueColor: '#1f4fa0',
        rule: { color: '#1f4fa0', width: 2, pad: 16 },
      };
    case 'poster':
      return { ...base, textBox: { ...base.textBox, width: 620 }, titleStretch: 'extra-condensed' };
    case 'zine':
      return {
        ...base,
        textBox: { ...base.textBox, width: 560 },
        titleFont: (size) => `900 ${size}px ${BODY}`,
        titleStretch: 'normal',
        priceColor: palette.ink,
      };
    case 'dossier':
      return {
        ...base,
        // 600 wide plus 30 of padding each side, 64 from the top, 40 from the bottom.
        textBox: { start: 70, top: 92, width: 600, height: CARD_HEIGHT - 92 - 68 },
        titleFont: (size) => `700 ${size}px ${MONO}`,
        titleStretch: 'normal',
        titleScale: 0.72,
        titleLineHeight: 1.25,
        cellValueFont: (size) => `700 ${size}px ${MONO}`,
        cellValueSize: 30,
      };
    case 'ticket':
      return {
        ...base,
        textBox: { start: 80, top: 236, width: 720, height: CARD_HEIGHT - 236 - 66 },
        align: 'start',
        titleScale: 0.78,
        showPrice: false,
        cellValueSize: 34,
      };
  }
}

/** Everything behind the text: ground, photograph, frames. */
function cardScene(ctx: Ctx, content: Content, look: CardLook, cover: HTMLImageElement, focal?: { x?: number; y?: number }) {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  ctx.fillStyle = look.palette.ground;
  ctx.fillRect(0, 0, W, H);

  switch (content.family) {
    case 'night': {
      photo(ctx, cover, 0, 0, W, H, focal);
      // From the text (inline-start) out to the photograph.
      const shade = ctx.createLinearGradient(W, 0, 0, 0);
      shade.addColorStop(0, 'rgba(11, 12, 10, 0.94)');
      shade.addColorStop(0.42, 'rgba(11, 12, 10, 0.72)');
      shade.addColorStop(0.78, 'rgba(11, 12, 10, 0.08)');
      shade.addColorStop(1, 'rgba(11, 12, 10, 0.08)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.85, H * 1.1, 0, W * 0.85, H * 1.1, W * 0.5);
      glow.addColorStop(0, `${content.accent.lift}59`);
      glow.addColorStop(1, `${content.accent.lift}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case 'paper': {
      photo(ctx, cover, 0, 0, 540, H, focal);
      return;
    }
    case 'blueprint': {
      ctx.fillStyle = '#f6f4ef';
      ctx.fillRect(0, 0, W, H);
      const grid = (step: number, color: string) => {
        ctx.fillStyle = color;
        for (let x = 0; x < W; x += step) ctx.fillRect(x, 0, 1, H);
        for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, 1);
      };
      grid(24, 'rgba(31, 79, 160, 0.09)');
      grid(120, 'rgba(31, 79, 160, 0.16)');
      const { x, y, w, h } = fromStart(W, { start: W - 48 - 500, top: 48, width: 500, height: H - 96 });
      photo(ctx, cover, x, y, w, h, focal);
      ctx.strokeStyle = '#1f4fa0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 11, y - 11, w + 22, h + 22);
      return;
    }
    case 'poster': {
      const x = 48;
      const y = 48;
      ctx.fillStyle = content.accent.base;
      ctx.fillRect(x, y, 330, 250);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(greyPhoto(cover, 330, 250, 1.1, focal), x, y);
      ctx.restore();
      return;
    }
    case 'zine': {
      const x = 44;
      const y = 40;
      const w = 480;
      const h = H - 80;
      rotated(ctx, x, y, w, h, -2, () => {
        ctx.fillStyle = '#0078bf';
        ctx.fillRect(x + 8, y + 6, w, h);
        ctx.fillStyle = '#ff48b0';
        ctx.fillRect(x, y, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(greyPhoto(cover, w, h, 1.25, focal), x, y);
        ctx.restore();
      });
      return;
    }
    case 'dossier': {
      // The tab, the typed sheet, then the photograph clipped to it.
      ctx.fillStyle = '#fbf8f0';
      const tab = t(content.category === 'vehicle' ? 'card.dossierVehicle' : 'card.dossierProperty');
      ctx.font = `700 22px ${MONO}`;
      const tabWidth = measureWith(ctx, ctx.font)(tab) + 48;
      const tabX = W - 64 - tabWidth;
      ctx.beginPath();
      ctx.roundRect(tabX, 24, tabWidth, 40, [10, 10, 0, 0]);
      ctx.fill();
      ctx.fillStyle = look.palette.ink;
      run(ctx, tab, W - 64 - 24, 24 + 20);
      ctx.fillStyle = '#fbf8f0';
      ctx.fillRect(W - 40 - 660, 64, 660, H - 64 - 40);
      const x = 70;
      const y = 70;
      rotated(ctx, x, y, 444, 324, 2, () => {
        ctx.shadowColor = 'rgba(31, 29, 24, 0.4)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 16;
        ctx.fillStyle = '#fbf8f0';
        ctx.fillRect(x, y, 444, 324);
        ctx.shadowColor = 'transparent';
        photo(ctx, cover, x + 12, y + 12, 420, 300, focal);
      });
      return;
    }
    case 'ticket': {
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(W - 40 - 800, 40, 800, H - 80);
      photo(ctx, cover, W - 40 - 800, 40, 800, 170, focal);
      // The stub, with its tear line on its inline-start side.
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(40, 40, 300, H - 80);
      ctx.strokeStyle = '#cfc9bb';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(40 + 300 - 2, 40);
      ctx.lineTo(40 + 300 - 2, H - 40);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
  }
}

export function drawCard(canvas: HTMLCanvasElement, listing: Listing, cover: HTMLImageElement): void {
  const content = shareContent(listing);
  const look = cardLook(content);
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const focal = { x: listing.media.cover.focalX, y: listing.media.cover.focalY };

  cardScene(ctx, content, look, cover, focal);

  const { palette, textBox } = look;
  const edge = CARD_WIDTH - textBox.start;
  const baseTitle = content.title.length > 56 ? 50 : content.title.length > 34 ? 60 : 72;
  const sizes = [baseTitle, 56, 50, 44, 38].filter((size) => size <= baseTitle).map((size) => Math.round(size * look.titleScale));
  const titleSize = fitSize(content.title, sizes, textBox.width, (size) => measureWith(ctx, look.titleFont(size)), 3);
  ctx.font = look.titleFont(titleSize);
  stretch(ctx, look.titleStretch);
  const titleLinesFit = wrapLines(content.title, textBox.width, measureWith(ctx, look.titleFont(titleSize)), 3);
  stretch(ctx, 'normal');

  const lead = content.family === 'poster' ? content.cells[0] : undefined;
  const cells = content.family === 'poster' ? content.cells.slice(1) : content.cells;

  const pieces: Piece[] = [];
  if (content.place) pieces.push(linesPiece(ctx, [content.place], `700 24px ${BODY}`, palette.ink2, 36));
  pieces.push(linesPiece(ctx, titleLinesFit, look.titleFont(titleSize), look.titleColor, titleSize * look.titleLineHeight, look.titleStretch));
  if (content.price && look.showPrice) {
    if (content.family === 'zine') {
      const font = `800 52px ${DISPLAY}`;
      const width = measureWith(ctx, font)(content.price) + 44;
      pieces.push({
        height: 57 + 20,
        draw: (edge, top) => {
          rotated(ctx, edge - width, top, width, 77, -3, () => {
            ctx.strokeStyle = '#ff48b0';
            ctx.lineWidth = 4;
            ctx.strokeRect(edge - width + 2, top + 2, width - 4, 73);
            ctx.font = font;
            ctx.fillStyle = palette.ink;
            run(ctx, content.price, edge - 22, top + 38.5);
          });
        },
      });
    } else {
      pieces.push(linesPiece(ctx, [content.price], `800 52px ${DISPLAY}`, look.priceColor, 57));
    }
  }
  if (cells.length > 0) {
    pieces.push(
      cellsPiece(
        ctx,
        cells,
        { font: look.cellValueFont(look.cellValueSize), size: look.cellValueSize, color: look.cellValueColor },
        { font: `700 20px ${BODY}`, size: 20, color: palette.ink2 },
        36,
        look.rule,
      ),
    );
  }
  pieces.push(agentPiece(ctx, content, 21, palette));

  const gap = content.family === 'ticket' ? 10 : 14;
  const height = stack(pieces, gap);
  const top = look.align === 'end' ? textBox.top + textBox.height - height : textBox.top;
  drawStack(pieces, edge, Math.max(textBox.top, top), gap);

  if (lead) {
    // The poster's numeral: huge, in the accent, at the inline-end corner.
    ctx.font = `800 200px ${DISPLAY}`;
    stretch(ctx, 'extra-condensed');
    ctx.fillStyle = content.accent.base;
    ctx.direction = lead.isolated ? 'ltr' : 'rtl';
    ctx.textAlign = lead.isolated ? 'start' : 'end';
    ctx.textBaseline = 'middle';
    ctx.fillText(lead.value, 48, CARD_HEIGHT - 40 - 39 - 100);
    stretch(ctx, 'normal');
    ctx.font = `800 26px ${BODY}`;
    ctx.fillStyle = palette.ink;
    ctx.direction = 'rtl';
    ctx.textAlign = 'end';
    ctx.fillText(lead.label, 48, CARD_HEIGHT - 40 - 19);
  }

  if (content.family === 'ticket') {
    const stubRight = 40 + 300 - 30;
    const lines: Piece[] = [linesPiece(ctx, [t('card.ticketTrip')], `400 22px ${MONO}`, '#55524a', 33)];
    if (content.place) {
      const to = wrapLines(`${t('card.ticketTo')}: ${content.place}`, 240, measureWith(ctx, `400 22px ${MONO}`), 3);
      lines.push(linesPiece(ctx, to, `400 22px ${MONO}`, '#55524a', 33));
    }
    if (content.price) {
      const size = fitSize(content.price, [48, 40, 34], 240, (s) => measureWith(ctx, `800 ${s}px ${DISPLAY}`), 1);
      lines.push(linesPiece(ctx, [content.price], `800 ${size}px ${DISPLAY}`, content.accent.base, size * 1.1));
    }
    const stubHeight = stack(lines, 12);
    drawStack(lines, stubRight, (CARD_HEIGHT - stubHeight) / 2, 12);
  }
}

// ---------------------------------------------------------------------------
// The story, 1080 × 1920
// ---------------------------------------------------------------------------

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export function drawStory(canvas: HTMLCanvasElement, listing: Listing, cover: HTMLImageElement, host: string): void {
  const content = shareContent(listing);
  const palette = content.storyMode === 'paper' ? PAPER : ONYX;
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const W = STORY_WIDTH;
  const H = STORY_HEIGHT;
  const side = 84;
  const width = W - side * 2;
  const edge = W - side;

  const flat = content.title;
  const titleSize = flat.length > 60 ? 72 : flat.length > 36 ? 86 : 104;
  const titleFont = `800 ${titleSize}px ${DISPLAY}`;
  stretch(ctx, 'condensed');
  const measureTitle = measureWith(ctx, titleFont);
  const lines = content.titleLines.flatMap((line) => wrapLines(line, width, measureTitle, 3)).slice(0, 5);
  stretch(ctx, 'normal');

  const pieces: Piece[] = [];
  if (content.place) pieces.push(linesPiece(ctx, wrapLines(content.place, width, measureWith(ctx, `700 34px ${BODY}`), 2), `700 34px ${BODY}`, palette.ink2, 51));
  pieces.push(linesPiece(ctx, lines, titleFont, palette.ink, titleSize * 1.02, 'condensed'));
  if (content.price) {
    pieces.push(linesPiece(ctx, [content.price], `800 84px ${DISPLAY}`, content.storyMode === 'paper' ? content.accent.base : content.accent.lift, 92));
  }
  if (content.cells.length > 0) {
    pieces.push(
      cellsPiece(
        ctx,
        content.cells,
        { font: `700 72px ${DISPLAY}`, size: 72, color: palette.ink },
        { font: `700 30px ${BODY}`, size: 30, color: palette.ink2 },
        56,
      ),
    );
  }
  // The foot: who to call on the start side, the link on the end side.
  const licence = content.licence ? `${t('listing.licenceNumber')} ${content.licence}` : undefined;
  const link = `${host}/a/${listing.slug}`;
  pieces.push({
    height: 30 + 2 + 34 + 57 + 48,
    draw: (edge, top) => {
      ctx.fillStyle = palette.line;
      ctx.fillRect(side, top + 30, width, 2);
      const y = top + 30 + 2 + 34;
      ctx.font = `700 38px ${BODY}`;
      ctx.fillStyle = palette.ink;
      run(ctx, content.name, edge, y + 28);
      ctx.font = `400 32px ${BODY}`;
      ctx.fillStyle = palette.ink2;
      const rest = [content.role, licence].filter(Boolean).join(' · ');
      if (rest) run(ctx, rest, edge, y + 57 + 24);
      ctx.font = `800 34px ${BODY}`;
      ctx.fillStyle = palette.ink;
      ctx.direction = 'ltr';
      ctx.textAlign = 'start';
      ctx.textBaseline = 'middle';
      ctx.fillText(link, side, y + 57 + 24);
    },
  });

  const bodyHeight = stack(pieces, 34) + 90;
  // The photograph takes what the words leave; the words overlap it by 150.
  const photoHeight = Math.max(640, H - bodyHeight + 150);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);
  photo(ctx, cover, 0, 0, W, photoHeight, { x: listing.media.cover.focalX, y: listing.media.cover.focalY });
  const fade = ctx.createLinearGradient(0, photoHeight, 0, 0);
  fade.addColorStop(0, palette.ground);
  fade.addColorStop(0.02, palette.ground);
  fade.addColorStop(0.45, `${palette.ground}00`);
  fade.addColorStop(1, `${palette.ground}00`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, photoHeight);

  drawStack(pieces, edge, Math.max(640 - 150, H - bodyHeight), 34);
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * WebP where the browser can write it; JPEG where it cannot (Safari on iOS
 * hands back PNG when asked for WebP). Both are images WhatsApp reads.
 */
export function encode(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; extension: 'webp' | 'jpg' }> {
  const as = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  return as('image/webp').then(async (webp) => {
    if (webp && webp.type === 'image/webp') return { blob: webp, extension: 'webp' as const };
    const jpeg = await as('image/jpeg');
    if (!jpeg) throw new Error('encode');
    return { blob: jpeg, extension: 'jpg' as const };
  });
}
