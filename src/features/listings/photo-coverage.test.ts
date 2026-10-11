import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import { bedroomsFor, photoCoverage, type CoveragePhoto } from './photo-coverage.js';
import type { PhotoRoom } from './photo-rooms.js';

const fact = (key: string, value: Fact['value'], extra: Partial<Fact> = {}): Fact => ({
  key,
  label: key,
  value,
  type: 'number',
  present: true,
  required: false,
  source: 'seller',
  ...extra,
});

const shot = (room?: PhotoRoom, status: CoveragePhoto['status'] = 'uploaded'): CoveragePhoto => ({
  ...(room ? { room } : {}),
  status,
});

const stateOf = (coverage: ReturnType<typeof photoCoverage>, room: PhotoRoom) =>
  coverage.needs.find((need) => need.room === room);

describe('bedroomsFor', () => {
  it('reads an Israeli room count: the living room is one of the rooms', () => {
    assert.equal(bedroomsFor(4), 3);
    assert.equal(bedroomsFor(3.5), 2);
    assert.equal(bedroomsFor(1.5), 0);
    assert.equal(bedroomsFor(1), 0);
  });
});

describe('photoCoverage', () => {
  it('a 4-room flat with a balcony owes living, kitchen, 3 bedrooms, bathroom, balcony', () => {
    const coverage = photoCoverage('property', [fact('rooms', 4), fact('balcony_sqm', 12)], []);
    assert.deepEqual(
      coverage.needs.map(({ room, need, optional }) => [room, need, optional]),
      [
        ['living', 1, false],
        ['kitchen', 1, false],
        ['bedroom', 3, false],
        ['bathroom', 1, false],
        ['balcony', 1, false],
        ['outdoor', 1, true],
      ],
    );
    // 2 living + kitchen + 3 bedrooms + bathroom + balcony + outdoor.
    assert.equal(coverage.recommended, 9);
  });

  it('says missing only when every photo has a room', () => {
    const labelled = photoCoverage('property', [fact('rooms', 3)], [shot('living'), shot('kitchen'), shot('bedroom')]);
    assert.equal(stateOf(labelled, 'bedroom')?.state, 'missing');
    assert.equal(stateOf(labelled, 'bathroom')?.state, 'missing');
    assert.equal(labelled.ready, false);

    // One unlabelled photo might be the bathroom: unsure, not missing.
    const partly = photoCoverage('property', [fact('rooms', 3)], [shot('living'), shot()]);
    assert.equal(stateOf(partly, 'bathroom')?.state, 'unsure');
    assert.equal(partly.unlabeled, 1);
  });

  it('is ready when uploads are done and every owed room is covered', () => {
    const photos = [shot('living'), shot('kitchen'), shot('bedroom'), shot('bedroom'), shot('bathroom')];
    const coverage = photoCoverage('property', [fact('rooms', 3)], photos);
    assert.equal(coverage.ready, true, 'the building photo is suggested, not owed');
    assert.equal(stateOf(coverage, 'outdoor')?.state, 'missing');
  });

  it('is not ready while a photo failed or is still uploading', () => {
    const photos = [shot('living'), shot('kitchen'), shot('bathroom')];
    assert.equal(photoCoverage('property', [fact('rooms', 1)], photos).ready, true);
    assert.equal(photoCoverage('property', [fact('rooms', 1)], [...photos, shot('kitchen', 'failed')]).failed, 1);
    assert.equal(photoCoverage('property', [fact('rooms', 1)], [...photos, shot('kitchen', 'failed')]).ready, false);
    assert.equal(photoCoverage('property', [fact('rooms', 1)], [...photos, shot(undefined, 'uploading')]).pending, 1);
  });

  it('an unanswered room count owes no bedrooms and still asks for a full page', () => {
    const coverage = photoCoverage('property', [fact('rooms', null, { present: false })], []);
    assert.equal(stateOf(coverage, 'bedroom'), undefined);
    assert.equal(coverage.recommended, 8);
  });

  it('a car has no rooms: uploads only', () => {
    const coverage = photoCoverage('vehicle', [], [shot(undefined), shot(undefined, 'failed')]);
    assert.deepEqual(coverage.needs, []);
    assert.equal(coverage.failed, 1);
    assert.equal(coverage.ready, false);
  });
});
