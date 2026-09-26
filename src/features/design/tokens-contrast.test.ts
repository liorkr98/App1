import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * WCAG 2.0 contrast for the tokens that replace opacity de-emphasis.
 *
 * Opacity .42 on אין measured 1.70–2.60:1 (docs/REDESIGN-AUDIT.md). The
 * --absent stop must clear 4.5:1 on every ground it can sit on.
 */

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

function tokenHex(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`));
  assert.ok(match, `missing ${name} hex in tokens.css`);
  return `#${match[1]!.toLowerCase()}`;
}

function scopedTokenHex(source: string, scope: string, name: string): string {
  const block = source.match(new RegExp(`${scope}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(block, `missing ${scope} block`);
  const match = block[1]!.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`));
  assert.ok(match, `missing ${name} hex in ${scope}`);
  return `#${match[1]!.toLowerCase()}`;
}

const TOKENS = readFileSync(new URL('../../../web/src/styles/tokens.css', import.meta.url), 'utf8');
const DARK = readFileSync(new URL('../../../web/src/styles/templates/dark.css', import.meta.url), 'utf8');
const AGENCY = readFileSync(new URL('../../../web/src/styles/templates/agency.css', import.meta.url), 'utf8');
const LINEN = readFileSync(new URL('../../../web/src/styles/templates/linen.css', import.meta.url), 'utf8');
const GALLERY = readFileSync(new URL('../../../web/src/styles/templates/gallery.css', import.meta.url), 'utf8');
const CINEMA = readFileSync(new URL('../../../web/src/styles/templates/cinema.css', import.meta.url), 'utf8');
const SHOWCASE = readFileSync(new URL('../../../web/src/styles/templates/showcase.css', import.meta.url), 'utf8');
const MUTED_ON_DARK = tokenHex(TOKENS, '--muted-on-dark');

const PLASTER = tokenHex(TOKENS, '--plaster');
const STONE_WARM = tokenHex(TOKENS, '--stone-warm');
const ABSENT = tokenHex(TOKENS, '--absent');
const MUTED = tokenHex(TOKENS, '--muted');
const MUTED_WARM = tokenHex(TOKENS, '--muted-warm');

describe('absent and muted tokens meet WCAG AA body', () => {
  it('--absent clears 4.5:1 on plaster, stone-warm and white', () => {
    for (const [name, ground] of [
      ['plaster', PLASTER],
      ['stone-warm', STONE_WARM],
      ['white', '#ffffff'],
    ] as const) {
      const ratio = contrast(ABSENT, ground);
      assert.ok(ratio >= 4.5, `--absent is ${ratio.toFixed(2)}:1 on ${name}`);
    }
  });

  it('the plan hex #7A7B72 is NOT the shipped stop', () => {
    assert.notEqual(ABSENT, '#7a7b72');
  });

  it('--muted-warm clears 4.5:1 on stone-warm', () => {
    const ratio = contrast(MUTED_WARM, STONE_WARM);
    assert.ok(ratio >= 4.5, `--muted-warm is ${ratio.toFixed(2)}:1 on stone-warm`);
  });

  it('--muted still clears 4.5:1 on plaster', () => {
    const ratio = contrast(MUTED, PLASTER);
    assert.ok(ratio >= 4.5, `--muted is ${ratio.toFixed(2)}:1 on plaster`);
  });

  it('dark --absent clears 4.5:1 on dark plaster', () => {
    const ground = scopedTokenHex(DARK, "html\\[data-template='dark'\\]", '--plaster');
    const absent = scopedTokenHex(DARK, "html\\[data-template='dark'\\]", '--absent');
    const ratio = contrast(absent, ground);
    assert.ok(ratio >= 4.5, `dark --absent is ${ratio.toFixed(2)}:1 on ${ground}`);
  });

  it('agency --muted clears 4.5:1 on white plaster', () => {
    const ground = scopedTokenHex(AGENCY, "html\\[data-template='agency'\\]", '--plaster');
    const muted = scopedTokenHex(AGENCY, "html\\[data-template='agency'\\]", '--muted');
    const ratio = contrast(muted, ground);
    assert.ok(ratio >= 4.5, `agency --muted is ${ratio.toFixed(2)}:1 on ${ground}`);
  });

  it('linen --absent (shared stop) clears 4.5:1 on linen plaster', () => {
    const ground = scopedTokenHex(LINEN, "html\\[data-template='linen'\\]", '--plaster');
    const ratio = contrast(ABSENT, ground);
    assert.ok(ratio >= 4.5, `--absent is ${ratio.toFixed(2)}:1 on linen ${ground}`);
  });

  it('--muted-on-dark clears 4.5:1 on studio ink-deep', () => {
    const ratio = contrast(MUTED_ON_DARK, '#141310');
    assert.ok(ratio >= 4.5, `--muted-on-dark is ${ratio.toFixed(2)}:1 on #141310`);
  });

  it('gallery and showcase keep the shared --absent and --muted readable on their grounds', () => {
    for (const [name, source] of [
      ['gallery', GALLERY],
      ['showcase', SHOWCASE],
    ] as const) {
      const scope = `html\\[data-template='${name}'\\]`;
      // Same pairing as the base tokens: --muted on plaster, --muted-warm on
      // the tinted blocks, --absent on both.
      const plaster = scopedTokenHex(source, scope, '--plaster');
      const warm = scopedTokenHex(source, scope, '--stone-warm');
      for (const [label, ink, token, ground] of [
        ['--absent', ABSENT, '--plaster', plaster],
        ['--absent', ABSENT, '--stone-warm', warm],
        ['--muted', MUTED, '--plaster', plaster],
        ['--muted-warm', MUTED_WARM, '--stone-warm', warm],
      ] as const) {
        const ratio = contrast(ink, ground);
        assert.ok(ratio >= 4.5, `${name} ${label} is ${ratio.toFixed(2)}:1 on ${token} ${ground}`);
      }
    }
  });

  it('cinema --absent and --muted clear 4.5:1 on its plaster and stone-warm', () => {
    const scope = "html\\[data-template='cinema'\\]";
    for (const token of ['--plaster', '--stone-warm'] as const) {
      const ground = scopedTokenHex(CINEMA, scope, token);
      for (const label of ['--absent', '--muted'] as const) {
        const ink = scopedTokenHex(CINEMA, scope, label);
        const ratio = contrast(ink, ground);
        assert.ok(ratio >= 4.5, `cinema ${label} is ${ratio.toFixed(2)}:1 on ${token} ${ground}`);
      }
    }
  });
});
