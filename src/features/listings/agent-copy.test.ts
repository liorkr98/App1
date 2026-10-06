import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import {
  acceptAgentDescription,
  AGENT_SYSTEM_PROMPT,
  AGENT_VARIANTS,
  agentDescription,
  agentDescriptions,
  agentPrompt,
  descriptionCoversArea,
  nextAgentDescription,
  tidyParagraphs,
  type AgentCopyInput,
} from './agent-copy.js';
import type { AreaPlaces } from './area-note.js';
import { reviewDescription } from './description.js';

const fact = (
  key: string,
  label: string,
  value: Fact['value'],
  extra: Partial<Fact> = {},
): Fact => ({
  key,
  label,
  value,
  type: 'text',
  present: true,
  required: false,
  source: 'seller',
  ...extra,
});

const at = (name: string, walkMinutes?: number, mode?: 'bus' | 'rail') => ({
  name,
  lat: 32.0154,
  lon: 34.7795,
  ...(walkMinutes === undefined ? {} : { walkMinutes }),
  ...(mode ? { mode } : {}),
});

/** The facts of the listing the agent sent on 5 Oct, which read flat. */
const FACTS: Fact[] = [
  fact('rooms', 'חדרים', 4, { type: 'number' }),
  fact('area_sqm', 'מ״ר', 154, { type: 'number' }),
  fact('floor', 'קומה', 4, { type: 'number' }),
  fact('balcony_sqm', 'מרפסת שמש', 25, { type: 'number' }),
  fact('aspect', 'כיווני אוויר', 'מערב', { type: 'enum' }),
  fact('condition', 'מצב הנכס', 'משופץ', { type: 'enum' }),
  fact('elevator', 'מעלית', true, { type: 'boolean' }),
  fact('parking', 'חניה', true, { type: 'boolean' }),
  fact('shelter', 'ממ״ד', true, { type: 'boolean' }),
];

/** Real OSM names around סוקולוב, חולון (as in area-note.test.ts), routed. */
const HOLON: AreaPlaces = {
  city: 'חולון',
  street: 'סוקולוב',
  origin: { lat: 32.0154, lon: 34.7795 },
  neighbourhoods: [at('רסקו א׳')],
  schools: [at('אורט חולון', 7), at('כצנלסון', 9), at('גן גרנית', 4)],
  transit: [at('סוקולוב/שדרות קוגל', 2, 'bus'), at('ויצמן/ההסתדרות', 6, 'bus')],
  parks: [at('גן הרצל', 5)],
  community: [at('ספריית בן יהודה', 8)],
  shops: [at('שופרסל אקספרס', 3), at('מאפה ברכה')],
};

const FLAT: AgentCopyInput = { category: 'property', city: 'חולון', facts: FACTS, places: HOLON };
const NO_AREA: AgentCopyInput = { category: 'property', city: 'חולון', facts: FACTS };

describe('agentDescription', () => {
  it('is the agent format: property, neighbourhood, closing, as paragraphs', () => {
    const text = agentDescription(FLAT, 0);
    const paragraphs = text.split('\n\n');
    assert.equal(paragraphs.length, 3);

    const [property, area, closing] = paragraphs as [string, string, string];
    assert.ok(property.startsWith('דירת 4 חדרים בשכונת רסקו א׳ בחולון.'), property);
    assert.ok(property.includes('154 מ״ר'));
    assert.ok(property.includes('בקומה 4'));
    assert.ok(property.includes('מרפסת שמש של 25 מ״ר'));
    assert.ok(property.includes('כיווני אוויר מערב'));
    assert.ok(property.includes('מעלית'));
    assert.ok(property.includes('ממ״ד'));

    // What the agent asked for: transport, the market, schools, culture — by
    // name, with the routed minutes.
    assert.ok(area.includes('תחנת האוטובוס סוקולוב/שדרות קוגל (שתי דקות הליכה)'), area);
    assert.ok(area.includes('שופרסל אקספרס (3 דק׳)'));
    assert.ok(area.includes('גן גרנית (4 דק׳)'));
    assert.ok(area.includes('ספריית בן יהודה'));
    assert.ok(closing.length > 0);
  });

  it('says "דקות הליכה" once per paragraph, whichever group comes first', () => {
    for (const text of agentDescriptions(FLAT)) {
      const area = text.split('\n\n')[1] ?? '';
      assert.equal(area.match(/דקות הליכה/g)?.length, 1, area);
    }
  });

  it('names a place without a routed time without a time, never a guess', () => {
    const text = agentDescription(FLAT, 0);
    assert.ok(text.includes('מאפה ברכה'));
    assert.equal(text.includes('מאפה ברכה ('), false);
  });

  it('closest first: the nearest school leads the list', () => {
    const area = agentDescription(FLAT, 2).split('\n\n')[1] ?? '';
    assert.ok(area.indexOf('גן גרנית') < area.indexOf('אורט חולון'));
  });

  it('has no neighbourhood paragraph when the address was never looked up', () => {
    const text = agentDescription(NO_AREA, 0);
    assert.equal(text.split('\n\n').length, 2);
    assert.equal(/הליכה|תחנת|בתי הספר/.test(text), false);
  });

  it('never advertises a confirmed absence', () => {
    const facts = [...FACTS, fact('storage', 'מחסן', null, { type: 'boolean', present: false })];
    const text = agentDescription({ ...FLAT, facts }, 0);
    assert.equal(text.includes('מחסן'), false);
    assert.equal(text.includes('אין'), false);
  });

  it('reads the entry date and the lease', () => {
    const facts = [
      ...FACTS,
      fact('entry_date', 'כניסה', '2027-03-15'),
      fact('has_tenants', 'מושכר', true, { type: 'boolean' }),
    ];
    const text = agentDescription({ ...FLAT, facts }, 0);
    assert.ok(text.includes('כניסה ב־15/03/2027.'));
    assert.ok(text.includes('הנכס מושכר כעת.'));
  });

  it('does not say "תחנת" twice when OSM already did', () => {
    const places = { ...HOLON, transit: [at('תחנת רכבת חולון וולפסון', 9, 'rail')] };
    const text = agentDescription({ ...FLAT, places }, 0);
    assert.ok(text.includes('תחנת רכבת חולון וולפסון (9 דקות הליכה)'));
    assert.equal(text.includes('תחנת תחנת'), false);
  });

  it('puts a maqaf between the vav and a Latin name', () => {
    const places = { ...HOLON, shops: [at('שופרסל אקספרס', 3), at('AM:PM', 4)] };
    assert.ok(agentDescription({ ...FLAT, places }, 0).includes('ו\u05BEAM:PM'));
  });

  it('is empty when the seller answered nothing that can be said', () => {
    assert.equal(agentDescription({ category: 'property', facts: [] }, 0), '');
  });

  it('passes the editor\'s own review: no hype, no valuation, no unsupported number', () => {
    for (const text of agentDescriptions(FLAT)) {
      const review = reviewDescription(text, FACTS, text);
      assert.deepEqual(review.bannedWords, [], text);
      assert.deepEqual(review.reservedTopics, [], text);
    }
  });

  it('every variant passes the same check a model reply must pass', () => {
    for (const text of agentDescriptions(FLAT)) {
      assert.equal(acceptAgentDescription(text, FLAT), text, text);
    }
    for (const text of agentDescriptions(NO_AREA)) {
      assert.equal(acceptAgentDescription(text, NO_AREA), text, text);
    }
  });
});

describe('another description', () => {
  it('has three different texts', () => {
    const variants = agentDescriptions(FLAT);
    assert.equal(variants.length, AGENT_VARIANTS);
    assert.equal(new Set(variants).size, AGENT_VARIANTS);
  });

  it('opens differently in each', () => {
    const openings = agentDescriptions(FLAT).map((text) => text.split(' ').slice(0, 3).join(' '));
    assert.equal(new Set(openings).size, AGENT_VARIANTS);
  });

  it('walks through all three, then comes round, never repeating the box', () => {
    const first = nextAgentDescription(FLAT);
    const second = nextAgentDescription(FLAT, first);
    const third = nextAgentDescription(FLAT, second);
    const fourth = nextAgentDescription(FLAT, third);
    assert.equal(new Set([first, second, third]).size, 3);
    assert.equal(fourth, first);
  });

  it('after the model\'s text, or the agent\'s own, gives the first variant', () => {
    assert.equal(nextAgentDescription(FLAT, 'טקסט שהסוכן כתב בעצמו.'), agentDescription(FLAT, 0));
  });

  it('differs from the box even when two variants come out the same', () => {
    const sparse: AgentCopyInput = { category: 'property', facts: [fact('rooms', 'חדרים', 3, { type: 'number' })] };
    let text = nextAgentDescription(sparse);
    for (let press = 0; press < 5; press += 1) {
      const next = nextAgentDescription(sparse, text);
      assert.notEqual(next, text);
      text = next;
    }
  });
});

describe('acceptAgentDescription', () => {
  const good =
    'דירת 4 חדרים בשכונת רסקו א׳ בחולון, 154 מ״ר בקומה 4, משופצת, עם מרפסת שמש של 25 מ״ר. בבניין מעלית, ולדירה חניה וממ״ד.\n\n' +
    'בסביבה: תחנת האוטובוס סוקולוב/שדרות קוגל במרחק 2 דקות הליכה, שופרסל אקספרס במרחק 3 דקות, וגן גרנית במרחק 4 דקות הליכה.\n\n' +
    'מוזמנים לתאם ביקור.';

  it('admits a grounded three-paragraph reply and keeps its paragraphs', () => {
    assert.equal(acceptAgentDescription(good, FLAT), good);
  });

  it('refuses a walking time the router never gave', () => {
    assert.equal(acceptAgentDescription(good.replace('3 דקות', '1 דקות'), FLAT), undefined);
  });

  it('refuses a school that is not in the list', () => {
    const invented = good.replace('וגן גרנית', 'ובית הספר הירוק');
    assert.equal(acceptAgentDescription(invented, FLAT), undefined);
  });

  it('refuses another city', () => {
    assert.equal(acceptAgentDescription(`${good} קרוב לתל אביב.`, FLAT), undefined);
  });

  it('refuses a valuation or a superlative', () => {
    assert.equal(acceptAgentDescription(`${good} השקעה מצוינת.`, FLAT), undefined);
    assert.equal(acceptAgentDescription(good.replace('משופצת', 'מדהימה'), FLAT), undefined);
  });

  it('refuses any area claim when no surroundings were looked up', () => {
    assert.equal(acceptAgentDescription(good, NO_AREA), undefined);
  });

  it('refuses a number that is not a fact or a minute', () => {
    assert.equal(acceptAgentDescription(good.replace('154', '160'), FLAT), undefined);
  });
});

describe('agentPrompt', () => {
  it('hands the model names and minutes, never coordinates', () => {
    const prompt = agentPrompt(FLAT);
    assert.ok(prompt.includes('סוקולוב/שדרות קוגל (שתי דקות הליכה)'));
    assert.equal(prompt.includes('32.01'), false);
    assert.equal(prompt.includes('34.77'), false);
  });

  it('says plainly when there is no area, so the model writes none', () => {
    assert.ok(agentPrompt(NO_AREA).includes('אין מידע על הסביבה'));
  });

  it('keeps the rules in the system prompt', () => {
    assert.ok(AGENT_SYSTEM_PROMPT.includes('אסור להמציא'));
    assert.ok(AGENT_SYSTEM_PROMPT.includes('אסור שווי'));
  });
});

describe('tidyParagraphs', () => {
  it('keeps paragraph breaks and drops markdown and quotes', () => {
    assert.equal(tidyParagraphs('"**א**  ב"\n\n\n ג \n'), 'א ב\n\nג');
  });
});

describe('descriptionCoversArea', () => {
  it('is true when the text names a place from the list', () => {
    assert.equal(descriptionCoversArea(agentDescription(FLAT, 0), HOLON), true);
    assert.equal(descriptionCoversArea(agentDescription(NO_AREA, 0), HOLON), false);
    assert.equal(descriptionCoversArea('משהו', undefined), false);
  });
});

describe('tone', () => {
  const tones = ['pro', 'warm', 'refined'] as const;

  it('gives a different text for each tone, so the chips visibly do something', () => {
    const texts = tones.map((tone) => agentDescription({ ...FLAT, tone }, 0));
    assert.equal(new Set(texts).size, 3);
  });

  it('says the same facts and the same places in every tone', () => {
    for (const tone of tones) {
      const text = agentDescription({ ...FLAT, tone }, 0);
      for (const needle of ['154 מ״ר', 'מרפסת שמש של 25 מ״ר', 'ממ״ד', 'גן גרנית', 'שופרסל אקספרס']) {
        assert.ok(text.includes(needle), `${tone}: ${needle}`);
      }
    }
  });

  it('passes the same checks in every tone and every variant', () => {
    for (const tone of tones) {
      for (const text of agentDescriptions({ ...FLAT, tone })) {
        assert.equal(acceptAgentDescription(text, { ...FLAT, tone }), text, text);
      }
      assert.equal(new Set(agentDescriptions({ ...FLAT, tone })).size, AGENT_VARIANTS, tone);
    }
  });
});
