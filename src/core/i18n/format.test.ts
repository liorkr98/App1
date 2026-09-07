import { heDate, heDateTime, ils, ltr, phone } from './format';

// U+200E LEFT-TO-RIGHT MARK. Every helper must emit it, because it is the
// character that stops Hebrew text from reordering the value (CLAUDE.md §4.4).
const LRM = String.fromCharCode(0x200e);

/** Strips the direction marks so the visible characters can be asserted. */
const visible = (value: string) => value.replaceAll(LRM, '');

describe('ltr', () => {
  it('wraps the value in left-to-right marks', () => {
    expect(ltr('AB-12')).toBe(`${LRM}AB-12${LRM}`);
  });

  it('leaves the visible characters untouched', () => {
    expect(visible(ltr('AB-12'))).toBe('AB-12');
  });
});

describe('ils — a price', () => {
  it('formats a whole amount with the shekel sign first and no decimals', () => {
    expect(visible(ils(1290))).toBe('₪1,290');
  });

  it('keeps up to two decimals when the amount is fractional', () => {
    expect(visible(ils(1290.5))).toBe('₪1,290.5');
    expect(visible(ils(19.99))).toBe('₪19.99');
  });

  it('direction-pins the result', () => {
    expect(ils(1290).startsWith(LRM)).toBe(true);
    expect(ils(1290).endsWith(LRM)).toBe(true);
  });

  it('handles zero and negative amounts', () => {
    expect(visible(ils(0))).toBe('₪0');
    expect(visible(ils(-50))).toBe('₪-50');
  });
});

describe('phone — a phone number', () => {
  it('formats a local mobile number', () => {
    expect(visible(phone('0541234567'))).toBe('054-1234567');
  });

  it('normalises a number that already has separators', () => {
    expect(visible(phone('054-123-4567'))).toBe('054-1234567');
  });

  it('formats a local landline number', () => {
    expect(visible(phone('021234567'))).toBe('02-1234567');
  });

  it('formats an international +972 number', () => {
    expect(visible(phone('+972541234567'))).toBe('+972-54-1234567');
  });

  it('passes an unrecognised number through, still direction-pinned', () => {
    expect(visible(phone('12345'))).toBe('12345');
    expect(phone('12345').startsWith(LRM)).toBe(true);
  });

  it('direction-pins the result', () => {
    expect(phone('0541234567')).toBe(`${LRM}054-1234567${LRM}`);
  });
});

describe('heDate / heDateTime — a date', () => {
  // 2026-09-07T14:30 local time. Month is zero-based in the Date constructor.
  const subject = new Date(2026, 8, 7, 14, 30);

  it('formats as dd/MM/yyyy with slashes, not the Intl he-IL dots', () => {
    expect(visible(heDate(subject))).toBe('07/09/2026');
  });

  it('zero-pads single-digit days and months', () => {
    expect(visible(heDate(new Date(2026, 0, 3)))).toBe('03/01/2026');
  });

  it('formats date and time on a 24-hour clock', () => {
    expect(visible(heDateTime(subject))).toBe('07/09/2026 14:30');
  });

  it('direction-pins both, with no stray marks in the middle', () => {
    expect(heDate(subject)).toBe(`${LRM}07/09/2026${LRM}`);
    expect(heDateTime(subject)).toBe(`${LRM}07/09/2026 14:30${LRM}`);
  });
});

describe('a Hebrew sentence with an embedded English word', () => {
  it('keeps the Latin run intact inside Hebrew text', () => {
    // "The app is built with React Native"
    const sentence = `האפליקציה בנויה עם ${ltr('React Native')}`;

    expect(sentence).toContain(`${LRM}React Native${LRM}`);
    expect(visible(sentence)).toBe('האפליקציה בנויה עם React Native');
  });

  it('keeps a price intact inside Hebrew text', () => {
    // "Total to pay: ₪1,290"
    const sentence = `סך הכל לתשלום: ${ils(1290)}`;

    expect(sentence).toContain(`${LRM}₪1,290${LRM}`);
    expect(visible(sentence)).toBe('סך הכל לתשלום: ₪1,290');
  });

  it('keeps a phone number intact inside Hebrew text', () => {
    // "Call us at 054-1234567"
    const sentence = `התקשרו אלינו ל־${phone('0541234567')}`;

    expect(sentence).toContain(`${LRM}054-1234567${LRM}`);
    expect(visible(sentence)).toBe('התקשרו אלינו ל־054-1234567');
  });
});
