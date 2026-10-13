import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { GUIDES, relatedGuides } from './guides.js';

/**
 * The table and the copy agree: every section the table names exists in
 * locales/he.json, there is no section the table forgot (it would never
 * render), and a section marked as a list has more than one line.
 */
const he = JSON.parse(readFileSync(resolve(process.cwd(), 'locales', 'he.json'), 'utf8')) as {
  guides: Record<string, Record<string, string>>;
};

describe('guides', () => {
  for (const guide of GUIDES.filter((candidate) => candidate.sections.length > 0)) {
    it(`${guide.slug}: the table matches the copy`, () => {
      const copy = he.guides[guide.slug];
      assert.ok(copy?.title && copy.lead, 'title and lead');
      guide.sections.forEach((kind, index) => {
        const body = copy[`s${index + 1}`];
        assert.ok(copy[`s${index + 1}Title`] && body, `section ${index + 1}`);
        if (kind === 'list') assert.ok(body.includes('\n'), `section ${index + 1} is a list`);
      });
      assert.equal(copy[`s${guide.sections.length + 1}Title`], undefined, 'no section beyond the table');
    });
  }

  it('relates two other guides, the same category first', () => {
    const related = relatedGuides('car-photos');
    assert.equal(related.length, 2);
    assert.equal(related[0]?.slug, 'car-listing');
    assert.ok(related.every((guide) => guide.slug !== 'car-photos'));
  });
});
