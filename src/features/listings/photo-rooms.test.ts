import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  groupByRoom,
  guessRoomFromName,
  hasRoomLabels,
  isPhotoRoom,
  isWalkItem,
  labeledWalkItems,
} from './photo-rooms.js';

describe('isPhotoRoom', () => {
  it('accepts the rooms the editor offers', () => {
    assert.equal(isPhotoRoom('kitchen'), true);
    assert.equal(isPhotoRoom('living'), true);
  });

  it('rejects a caption, an empty string, and junk', () => {
    assert.equal(isPhotoRoom('מטבח'), false);
    assert.equal(isPhotoRoom(''), false);
    assert.equal(isPhotoRoom('garage'), false);
  });
});

describe('groupByRoom', () => {
  it('walks living then kitchen, not the upload order', () => {
    const photos = [
      { id: 'k', room: 'kitchen' as const },
      { id: 'l', room: 'living' as const },
      { id: 'b', room: 'bedroom' as const },
    ];

    assert.deepEqual(
      groupByRoom(photos).map((group) => [group.room, group.items.map((item) => item.id)]),
      [
        ['living', ['l']],
        ['kitchen', ['k']],
        ['bedroom', ['b']],
      ],
    );
  });

  it('keeps unlabeled photographs, with no invented headline', () => {
    const photos = [{ id: 'a', room: 'kitchen' as const }, { id: 'b' }];

    const groups = groupByRoom(photos);
    assert.equal(groups[1]?.room, undefined);
    assert.deepEqual(
      groups[1]?.items.map((item) => item.id),
      ['b'],
    );
  });

  it('omits empty rooms', () => {
    const groups = groupByRoom([{ id: 'k', room: 'kitchen' as const }]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.room, 'kitchen');
  });
});

describe('hasRoomLabels', () => {
  it('is false when nobody named a room', () => {
    assert.equal(hasRoomLabels([{}, {}]), false);
  });

  it('is true when one photograph has a room', () => {
    assert.equal(hasRoomLabels([{ id: 'a' }, { id: 'b', room: 'balcony' as const }]), true);
  });
});

describe('guessRoomFromName', () => {
  it('reads Hebrew and English room words from a filename', () => {
    assert.equal(guessRoomFromName('מטבח-2.jpg'), 'kitchen');
    assert.equal(guessRoomFromName('IMG_bathroom_01.HEIC'), 'bathroom');
    assert.equal(guessRoomFromName('bedroom.jpeg'), 'bedroom');
  });

  it('stays silent on a camera-roll name', () => {
    assert.equal(guessRoomFromName('IMG_2048.jpg'), undefined);
    assert.equal(guessRoomFromName(''), undefined);
  });
});

describe('labeledWalkItems', () => {
  it('returns labelled photographs in tour order, not upload order', () => {
    const photos = [
      { id: 'k', url: '/k.jpg', room: 'kitchen' as const },
      { id: 'l', url: '/l.jpg', room: 'living' as const },
      { id: 'x', url: '/x.jpg' },
    ];
    assert.deepEqual(
      labeledWalkItems(photos).map((item) => item.id),
      ['l', 'k'],
    );
  });

  it('is empty when nobody named a room', () => {
    const photos: { id: string; url: string; room?: 'kitchen' }[] = [{ id: 'a', url: '/a.jpg' }];
    assert.deepEqual(labeledWalkItems(photos), []);
  });
});

describe('isWalkItem', () => {
  it('matches by id or url so the gallery can drop a duplicate', () => {
    const walk = [{ id: 'k', url: '/k.jpg' }];
    assert.equal(isWalkItem({ id: 'k', url: '/other.jpg' }, walk), true);
    assert.equal(isWalkItem({ id: 'other', url: '/k.jpg' }, walk), true);
    assert.equal(isWalkItem({ id: 'x', url: '/x.jpg' }, walk), false);
  });
});
