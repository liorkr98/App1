import { useMemo, useState } from 'react';

import { PHOTO_ROOMS, type PhotoRoom } from '@/features/listings/photo-rooms';

import { t } from '../../lib/i18n';
import { Message } from './Message';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  photos: readonly EditorPhoto[];
  onChange: (photos: EditorPhoto[]) => void;
}

/**
 * Naming the rooms, one photograph at a time.
 *
 * This is the walk. The listing page has no JavaScript, so the only way a
 * buyer sees "מטבח" on a still is if the agent named it here. A tiny select
 * under a thumbnail is easy to skip on a train; a large photograph with
 * chips is a question they can answer with a thumb.
 *
 * Optional. Unnamed photographs simply do not join the walk — the same
 * omit-empty rule as the rest of the page. Filename hints are already
 * applied on add; this step is confirmation, not invention.
 */
export function RoomsStep({ photos, onChange }: Props) {
  const firstUnnamed = photos.findIndex((photo) => !photo.room);
  const [at, setAt] = useState(() => (firstUnnamed === -1 ? 0 : firstUnnamed));
  const index = photos.length === 0 ? 0 : Math.min(at, photos.length - 1);
  const photo = photos[index];
  const named = useMemo(() => photos.filter((item) => item.room).length, [photos]);

  const setRoom = (room: PhotoRoom | undefined) => {
    if (!photo) return;
    onChange(
      photos.map((item, position) => {
        if (position !== index) return item;
        if (!room) {
          const { room: _omitted, ...rest } = item;
          return rest;
        }
        return { ...item, room };
      }),
    );
    if (room && index < photos.length - 1) setAt(index + 1);
  };

  if (!photo) {
    return <p className="hint">{t('editor.roomsEmpty')}</p>;
  }

  return (
    <>
      <p className="hint">{t('editor.roomsHint')}</p>
      <p className="note">
        <Message path="editor.roomsNamed" values={{ named, total: photos.length }} />
      </p>

      <figure className="room-ask">
        <img src={photo.url} alt={photo.alt?.trim() || ''} />
        <figcaption>
          <Message path="editor.roomsWhich" values={{ current: index + 1, total: photos.length }} />
        </figcaption>
      </figure>

      <ul className="room-chips">
        {PHOTO_ROOMS.map((room) => (
          <li key={room}>
            <button
              type="button"
              className={photo.room === room ? 'room-chip chosen' : 'room-chip'}
              aria-pressed={photo.room === room}
              onClick={() => setRoom(photo.room === room ? undefined : room)}
            >
              {t(`editor.rooms.${room}`)}
            </button>
          </li>
        ))}
      </ul>

      <div className="room-nav">
        <button type="button" onClick={() => setAt(index - 1)} disabled={index === 0}>
          {t('editor.earlier')}
        </button>
        <button
          type="button"
          onClick={() => setAt(index + 1)}
          disabled={index >= photos.length - 1}
        >
          {t('editor.later')}
        </button>
      </div>
    </>
  );
}
