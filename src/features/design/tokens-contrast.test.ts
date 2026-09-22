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

const TOKENS = readFileSync(new URL('../../../web/src/styles/tokens.css', import.meta.url), 'utf8');

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
});
