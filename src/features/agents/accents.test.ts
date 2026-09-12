import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACCENT_IDS, ACCENTS, DEFAULT_ACCENT, accentFor, isAccentId } from './accents.js';

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const channel = (pair: string) => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  const r = channel(hex.slice(1, 3));
  const g = channel(hex.slice(3, 5));
  const b = channel(hex.slice(5, 7));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

const PLASTER = '#fbfaf7';
const INK_DEEP = '#111208';
/** The dark template's ground, which is lighter than --ink-deep. */
const DARK_GROUND = '#14150f';

/**
 * Every LIGHT ground a template redefines --plaster to.
 *
 * THIS LIST HAS TO GROW WITH THE TEMPLATES, and that is the point of it. An
 * accent is chosen once by the agent and then carried onto whichever template
 * each listing uses, so "this accent is readable" is a claim about all of them
 * and not about the default ground. A template whose ground is missing here is
 * a palette no test is checking.
 *
 * Both directions are covered by one ratio: `base` is the accent printed on
 * the ground, and `.cta` fills with `base` and sets its label in `--plaster`,
 * which on these templates IS the ground. Contrast is symmetric, so the same
 * number answers both questions.
 */
const LIGHT_GROUNDS = [
  ['editorial / default', PLASTER],
  ['agency', '#ffffff'],
  ['sheet', '#ffffff'],
  ['ledger', '#fdfcf9'],
  ['warm', '#faf6ee'],
] as const;

describe('the accent palette', () => {
  it('defaults to olive, because that is the brand', () => {
    // An agent who never opens the picker gets the product's own colour.
    assert.equal(DEFAULT_ACCENT, 'olive');
    assert.equal(ACCENTS[0].id, 'olive');
  });

  it('offers no blue, and that is a product rule not a taste', () => {
    // CLAUDE.md §2: every Israeli property brand is blue and the point of
    // olive was to not be. This asserts the rule rather than trusting it —
    // blue is the hue a future "just one more option" would reach for.
    for (const accent of ACCENTS) {
      for (const hex of [accent.base, accent.lift]) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // Blue dominant by a clear margin. A neutral where all three are close
        // (charcoal) is not blue and must not trip this.
        assert.ok(
          !(b > r + 18 && b > g + 18),
          `${accent.id} ${hex} reads as blue: rgb(${r}, ${g}, ${b})`,
        );
      }
    }
  });

  it('every base carries plaster type at AA, on every template ground', () => {
    // `base` fills a button with --plaster on it. 4.5:1 is the bar for the
    // button label, which is body-sized — and the same ratio covers the accent
    // printed on the ground, since contrast is symmetric.
    //
    // Checked against every light template rather than only the default: an
    // accent the agent picked once has to hold on whichever template each of
    // their listings uses.
    for (const accent of ACCENTS) {
      for (const [template, ground] of LIGHT_GROUNDS) {
        const ratio = contrast(accent.base, ground);
        assert.ok(
          ratio >= 4.5,
          `${accent.id} base is ${ratio.toFixed(2)}:1 on the ${template} ground (${ground})`,
        );
      }
    }
  });

  it('every lift is readable as display type on both dark grounds', () => {
    // `lift` is type ON a dark surface — the enrichment block (--ink-deep) and
    // the dark template's ground, which is the lighter of the two and
    // therefore the harder test. 3:1 is the large-text bar, which is what
    // these are used for.
    for (const accent of ACCENTS) {
      for (const ground of [INK_DEEP, DARK_GROUND]) {
        const ratio = contrast(accent.lift, ground);
        assert.ok(ratio >= 3, `${accent.id} lift is ${ratio.toFixed(2)}:1 on ${ground}`);
      }
    }
  });

  it('lift is genuinely lighter than base, not a second colour', () => {
    // The whole point is one hue at two values. A lift that is darker or
    // barely different would not solve the problem it exists for.
    for (const accent of ACCENTS) {
      assert.ok(
        luminance(accent.lift) > luminance(accent.base) + 0.04,
        `${accent.id} lift is not meaningfully lighter than its base`,
      );
    }
  });

  it('ids are unique and lower-case, because they are written to Postgres', () => {
    // The CHECK constraint in 0011 lists these literally. A duplicate or a
    // capital here is a constraint violation at insert time.
    const seen = new Set(ACCENT_IDS);
    assert.equal(seen.size, ACCENT_IDS.length);

    for (const id of ACCENT_IDS) {
      assert.equal(id, id.toLowerCase(), id);
      assert.match(id, /^[a-z]+$/, id);
    }
  });
});

describe('accentFor', () => {
  it('finds an accent by id', () => {
    assert.equal(accentFor('clay').base, '#8c4a2f');
  });

  it('falls back rather than throwing, on the render path of a public page', () => {
    // A listing carrying an accent that was later removed from the list must
    // lose its colour, not its page.
    assert.equal(accentFor('a-colour-we-dropped').id, 'olive');
    assert.equal(accentFor(null).id, 'olive');
    assert.equal(accentFor(undefined).id, 'olive');
  });
});

describe('isAccentId', () => {
  it('accepts what we offer and refuses what we do not', () => {
    assert.equal(isAccentId('wine'), true);
    assert.equal(isAccentId('cornflower'), false);
    // Values that arrive from a form or a JSON column.
    assert.equal(isAccentId(''), false);
    assert.equal(isAccentId(null), false);
    assert.equal(isAccentId(7), false);
  });
});
