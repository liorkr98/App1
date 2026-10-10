import type { Coverage, RoomNeed } from '@/features/listings/photo-coverage';

import { t } from '../../lib/i18n';
import { Message } from './Message';

interface Props {
  coverage: Coverage;
  /** How many photographs there are now. */
  count: number;
  /** `line` is the one-sentence form the publish step shows. */
  variant?: 'full' | 'line';
}

const roomName = (need: RoomNeed) =>
  need.room === 'bedroom' && need.need > 1 ? t('editor.checklist.bedrooms') : t(`editor.rooms.${need.room}`);

/**
 * Which photographs the facts say a buyer will look for, and which are not
 * there yet (photo-coverage.ts). Advice, never a block: the publish button
 * does not read it.
 */
export function PhotoChecklist({ coverage, count, variant = 'full' }: Props) {
  if (count === 0) return null;
  const owedGaps = coverage.needs.filter((need) => !need.optional && need.state === 'missing');

  if (variant === 'line') {
    if (coverage.ready) {
      return (
        <p className="photo-check-line is-ready" role="status">
          {t('editor.checklist.ready')}
        </p>
      );
    }
    return (
      <div className="photo-check-line" role="status">
        <p>{t('editor.checklist.before')}</p>
        <ul>
          {coverage.failed > 0 ? (
            <li>
              <Message path="editor.checklist.failed" values={{ count: coverage.failed }} />
            </li>
          ) : null}
          {coverage.pending > 0 ? (
            <li>
              <Message path="editor.checklist.pending" values={{ count: coverage.pending }} />
            </li>
          ) : null}
          {owedGaps.length > 0 ? (
            <li>
              <Message
                path="editor.checklist.missingRooms"
                values={{ rooms: owedGaps.map(roomName).join(', ') }}
              />
            </li>
          ) : null}
          {coverage.unlabeled > 0 ? (
            <li>
              <Message path="editor.checklist.unlabeled" values={{ count: coverage.unlabeled }} />
            </li>
          ) : null}
        </ul>
      </div>
    );
  }

  return (
    <section className="photo-check" aria-label={t('editor.checklist.title')}>
      <h3>{t('editor.checklist.title')}</h3>
      {coverage.needs.length > 0 ? (
        <ul className="photo-check-rooms">
          {coverage.needs.map((need) => (
            <li key={need.room} className={`is-${need.state}${need.optional ? ' is-optional' : ''}`}>
              <span className="photo-check-mark" aria-hidden="true">
                {need.state === 'ok' ? '✓' : '·'}
              </span>
              <span>
                <Message
                  path="editor.checklist.row"
                  values={{ room: roomName(need), have: Math.min(need.have, need.need), need: need.need }}
                />
              </span>
              <span className="photo-check-state">
                {need.state === 'ok'
                  ? t('editor.checklist.ok')
                  : need.optional
                    ? t('editor.checklist.suggested')
                    : t(`editor.checklist.${need.state}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="photo-check-notes">
        {count < coverage.recommended ? (
          <li>
            <Message path="editor.checklist.total" values={{ count: coverage.recommended, have: count }} />
          </li>
        ) : null}
        {coverage.unlabeled > 0 && coverage.needs.length > 0 ? (
          <li>
            <Message path="editor.checklist.unlabeled" values={{ count: coverage.unlabeled }} />
          </li>
        ) : null}
        {coverage.failed > 0 ? (
          <li className="is-failed">
            <Message path="editor.checklist.failed" values={{ count: coverage.failed }} />
          </li>
        ) : null}
        {coverage.pending > 0 ? (
          <li>
            <Message path="editor.checklist.pending" values={{ count: coverage.pending }} />
          </li>
        ) : null}
        {coverage.ready ? <li className="is-ready">{t('editor.checklist.ready')}</li> : null}
      </ul>
    </section>
  );
}
