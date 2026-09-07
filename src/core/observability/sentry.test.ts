import { __scrubForTests as scrub, __scrubStringForTests as scrubString } from './sentry';

/**
 * Tests for the PII scrubbing required by CLAUDE.md §8.
 *
 * These matter because the failure is silent: nothing breaks if scrubbing
 * regresses, the data just quietly starts landing in a third party's storage.
 */

describe('scrubString', () => {
  it('redacts an email anywhere in the string', () => {
    expect(scrubString('failed for user lior@example.com while saving')).toBe(
      'failed for user [redacted] while saving',
    );
  });

  it('redacts an Israeli mobile number, with or without separators', () => {
    expect(scrubString('called 054-1234567')).toBe('called [redacted]');
    expect(scrubString('called 0541234567')).toBe('called [redacted]');
    expect(scrubString('called +972-54-1234567')).toContain('[redacted]');
  });

  it('redacts a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc-def_123';
    expect(scrubString(`Authorization: Bearer ${jwt}`)).toBe('Authorization: Bearer [redacted]');
  });

  it('leaves ordinary text alone', () => {
    expect(scrubString('Network request failed')).toBe('Network request failed');
  });
});

describe('scrub', () => {
  it('redacts sensitive keys regardless of case', () => {
    expect(scrub({ Email: 'a@b.com', Token: 'xyz', count: 3 })).toEqual({
      Email: '[redacted]',
      Token: '[redacted]',
      count: 3,
    });
  });

  it('redacts inside nested objects and arrays', () => {
    expect(scrub({ user: { profile: { phone: '0541234567' } }, tags: ['a@b.com'] })).toEqual({
      user: { profile: { phone: '[redacted]' } },
      tags: ['[redacted]'],
    });
  });

  it('preserves non-sensitive values', () => {
    expect(scrub({ statusCode: 500, ok: false, note: null })).toEqual({
      statusCode: 500,
      ok: false,
      note: null,
    });
  });

  it('stops at the depth limit instead of walking forever', () => {
    // Build a structure deeper than the limit; the call must return, not hang.
    let deep: Record<string, unknown> = { email: 'a@b.com' };
    for (let i = 0; i < 20; i += 1) {
      deep = { nested: deep };
    }
    expect(() => scrub(deep)).not.toThrow();
  });
});
