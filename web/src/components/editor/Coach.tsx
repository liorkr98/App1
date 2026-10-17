import { useEffect, useState } from 'react';

import { t } from '../../lib/i18n';

/**
 * One hint at a time on an agent's first listing (16 Oct 2026): a line at the
 * top of the screen saying what to do, and a ring on the thing to tap.
 *
 * Shown on a new listing only, never on one opened for editing; each hint
 * goes for good when dismissed, and all of them after the first publish.
 * Remembered in this browser alone: a hint seen twice is a small price, a
 * table for it would not be.
 */
export type CoachStep = 'kind' | 'photos' | 'order' | 'details' | 'detailsCar' | 'ready' | 'publish';

const TARGET: Record<CoachStep, string> = {
  // The pair, not the first card: a ring on one card reads as advice to pick it.
  kind: '.kind-choices',
  photos: '.picker',
  order: '.strip .shot',
  details: '#d-city',
  detailsCar: '.screen-details input',
  ready: '.ready-design',
  publish: '.publish-button',
};

const KEY = 'amudsell.coach';

interface Seen {
  done?: boolean;
  seen?: string[];
}

function read(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Seen;
  } catch {
    return {};
  }
}

function write(next: Seen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: the hints come back next time, which is harmless.
  }
}

/** After the first publish the agent knows the way; no more hints anywhere. */
export function coachDone(): void {
  write({ ...read(), done: true });
}

export function Coach({ step }: { step: CoachStep | undefined }) {
  const [seen, setSeen] = useState<Seen | undefined>(undefined);
  useEffect(() => setSeen(read()), []);
  const show = Boolean(step && seen && !seen.done && !seen.seen?.includes(step));

  useEffect(() => {
    if (!show || !step) return;
    // The ring goes on the first matching element once it is in the page.
    const target = document.querySelector(TARGET[step]);
    target?.classList.add('coach-target');
    return () => target?.classList.remove('coach-target');
  }, [show, step]);

  if (!show || !step) return null;
  return (
    <p className="coach" role="status">
      <span className="coach-label">{t('editor.coach.label')}</span>
      <span className="coach-text">{t(`editor.coach.${step}`)}</span>
      <button
        type="button"
        className="coach-ok"
        onClick={() => {
          const next = { ...read(), seen: [...(read().seen ?? []), step] };
          write(next);
          setSeen(next);
        }}
      >
        {t('editor.coach.ok')}
      </button>
      {/* A way out of the whole tour, not only this hint (audit, 17 Oct 2026). */}
      <button
        type="button"
        className="coach-skip"
        onClick={() => {
          coachDone();
          setSeen(read());
        }}
      >
        {t('editor.coach.skip')}
      </button>
    </p>
  );
}
