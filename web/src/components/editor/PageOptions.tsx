import { useEffect, useState } from 'react';

import { cleanVideoUrl, openHouseFrom, type ListingExtras } from '@/features/listings/page-extras';
import type { ListingCategory } from '@/features/listings/schemas';

import { t } from '../../lib/i18n';
import { readExtras, saveExtras } from '../../lib/page-options';

interface Props {
  listingId: string | undefined;
  category: ListingCategory;
  tourUrl: string | undefined;
  videoUrl: string | undefined;
  onLinks: (links: { tourUrl?: string | undefined; videoUrl?: string | undefined }) => void;
  /** How many switches are on (visit, calculator, warranty, open house), for the closed row's summary. */
  onCount?: (count: number) => void;
}

/** The open house's date and times as the agent typed them, in Israel time. */
function wallClock(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/**
 * What the agent adds to this one page (0047, 19 Oct 2026). Every option is
 * off until they turn it on, and each saves as it changes. The links travel
 * with the editor's own save (listings.media); the switches are their own
 * column, saved here, so a database without 0047 loses only these.
 */
export function PageOptions({ listingId, category, tourUrl, videoUrl, onLinks, onCount }: Props) {
  const [extras, setExtras] = useState<ListingExtras>({});
  const [unsaved, setUnsaved] = useState(false);
  const [openDate, setOpenDate] = useState('');
  const [openFrom, setOpenFrom] = useState('');
  const [openTo, setOpenTo] = useState('');
  const [videoDraft, setVideoDraft] = useState(videoUrl ?? '');
  const [videoBad, setVideoBad] = useState(false);
  // The dates show only when the agent says there is an open house
  // (19 Oct 2026): most listings have none, and three empty date and time
  // boxes made the publish screen look like a form to fill in.
  const [openTicked, setOpenTicked] = useState(false);
  const openShown = openTicked || Boolean(extras.openHouse);

  useEffect(() => {
    onCount?.(Object.keys(extras).length);
  }, [extras, onCount]);

  useEffect(() => {
    if (!listingId) return;
    let live = true;
    void readExtras(listingId).then((saved) => {
      if (!live || !saved) return;
      setExtras(saved);
      if (saved.openHouse) {
        const from = wallClock(saved.openHouse.start);
        setOpenDate(from.date);
        setOpenFrom(from.time);
        setOpenTo(wallClock(saved.openHouse.end).time);
      }
    });
    return () => {
      live = false;
    };
  }, [listingId]);

  useEffect(() => setVideoDraft(videoUrl ?? ''), [videoUrl]);

  const change = (next: ListingExtras) => {
    setExtras(next);
    if (!listingId) return;
    void saveExtras(listingId, next).then((ok) => setUnsaved(!ok));
  };
  const toggle = (key: 'visit' | 'calculator' | 'warranty' | 'film', on: boolean) => {
    const { [key]: _dropped, ...rest } = extras;
    change(on ? { ...rest, [key]: true } : rest);
  };
  const setOpenHouse = (date: string, from: string, to: string) => {
    const { openHouse: _dropped, ...rest } = extras;
    const openHouse = openHouseFrom(date, from, to);
    if (openHouse) change({ ...rest, openHouse });
  };
  const clearOpenHouse = () => {
    const { openHouse: _dropped, ...rest } = extras;
    setOpenDate('');
    setOpenFrom('');
    setOpenTo('');
    setOpenTicked(false);
    change(rest);
  };

  const car = category === 'vehicle';

  return (
    <fieldset className="page-options">
      <legend className="field-label">{t('editor.options.title')}</legend>
      <p className="field-hint">{t('editor.options.lead')}</p>

      <label className="declare">
        <input type="checkbox" checked={extras.visit === true} onChange={(event) => toggle('visit', event.target.checked)} />
        <span>{t(car ? 'editor.options.visitCar' : 'editor.options.visit')}</span>
      </label>

      <label className="declare">
        <input type="checkbox" checked={extras.film === true} onChange={(event) => toggle('film', event.target.checked)} />
        <span>{t('editor.options.film')}</span>
      </label>

      <label className="declare">
        <input
          type="checkbox"
          checked={extras.calculator === true}
          onChange={(event) => toggle('calculator', event.target.checked)}
        />
        <span>{t(car ? 'editor.options.calculatorCar' : 'editor.options.calculator')}</span>
      </label>

      {car ? (
        <label className="declare">
          <input
            type="checkbox"
            checked={extras.warranty === true}
            onChange={(event) => toggle('warranty', event.target.checked)}
          />
          <span>{t('editor.options.warranty')}</span>
        </label>
      ) : (
        <div className="field open-house">
          <label className="declare">
            <input
              type="checkbox"
              checked={openShown}
              onChange={(event) => (event.target.checked ? setOpenTicked(true) : clearOpenHouse())}
            />
            <span>{t('editor.options.openHouse')}</span>
          </label>
          {openShown ? (
            <div className="open-house-row">
              <input
                className="field-input"
                type="date"
                aria-label={t('editor.options.openDate')}
                value={openDate}
                onChange={(event) => {
                  setOpenDate(event.target.value);
                  setOpenHouse(event.target.value, openFrom, openTo);
                }}
              />
              <input
                className="field-input"
                type="time"
                aria-label={t('editor.options.openFrom')}
                value={openFrom}
                onChange={(event) => {
                  setOpenFrom(event.target.value);
                  setOpenHouse(openDate, event.target.value, openTo);
                }}
              />
              <input
                className="field-input"
                type="time"
                aria-label={t('editor.options.openTo')}
                value={openTo}
                onChange={(event) => {
                  setOpenTo(event.target.value);
                  setOpenHouse(openDate, openFrom, event.target.value);
                }}
              />
            </div>
          ) : null}
          {openShown ? <p className="field-hint">{t('editor.options.openHint')}</p> : null}
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="p-video-url">
          {t('editor.options.video')}
        </label>
        <input
          id="p-video-url"
          className="field-input"
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          value={videoDraft}
          onChange={(event) => setVideoDraft(event.target.value)}
          onBlur={() => {
            const typed = videoDraft.trim();
            const clean = typed ? cleanVideoUrl(typed) : undefined;
            setVideoBad(Boolean(typed) && !clean);
            if (!typed || clean) onLinks({ videoUrl: clean });
          }}
          aria-describedby="p-video-url-hint"
        />
        <p className="field-hint" id="p-video-url-hint">
          {t(videoBad ? 'editor.options.videoBad' : 'editor.options.videoHint')}
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="p-tour-url">
          {t('editor.options.tour')}
        </label>
        <input
          id="p-tour-url"
          className="field-input"
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          defaultValue={tourUrl ?? ''}
          onBlur={(event) => {
            const typed = event.target.value.trim();
            onLinks({ tourUrl: typed.startsWith('https://') ? typed : undefined });
          }}
        />
      </div>

      {unsaved ? <p className="field-hint">{t('editor.options.unsaved')}</p> : null}
    </fieldset>
  );
}
