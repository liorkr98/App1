import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EditorState } from '@/features/listings/editor';
import type { AgentProfile } from '@/features/agents/profile';

import { t } from '../../lib/i18n';
import { previewPayload, type MediaExtras } from '../../lib/listing-row';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  state: EditorState;
  photos: readonly EditorPhoto[];
  profile: AgentProfile;
  extras?: MediaExtras;
  /** Coarse street midpoint for the sun template. Never a pin. */
  sun?: { lat: number; lng: number };
}

/**
 * The live preview: the real listing page, in a phone.
 *
 * It replaces a hand-drawn miniature that could only ever look like the 1.x
 * page. The editor fetches the row a save would write from /preview, and the
 * server renders the same ListingPage as /a/[slug], template and all.
 *
 * TWO FRAMES, so a change never flashes white: the next page loads in the
 * hidden frame and only then fades over the shown one. Switching template is
 * therefore a cross-fade from one finished page to the other (M12); with
 * reduced motion it is an instant swap. Posts are debounced so typing a
 * title does not reload the page on every key.
 *
 * The HTML is fetched and assigned as srcdoc. A form targeted at a named
 * iframe dropped the second template: the load event for /preview/ did not
 * fire again, so the front frame stayed on the first page. srcdoc is a new
 * document every time, and a generation token ignores a response that a
 * newer template pick has already replaced.
 *
 * The frame is laid out at a phone's 390 × 844 and scaled to fit, so 84svh
 * heroes and container units resolve the way a buyer's phone resolves them.
 */
const PHONE_W = 390;
const PHONE_H = 844;
const DEBOUNCE_MS = 450;

export function LivePreview({ state, photos, profile, extras, sun }: Props) {
  const body = useMemo(
    () => JSON.stringify(previewPayload(state, photos, profile, t('editor.livePreview.title'), extras, sun)),
    [state, photos, profile, extras, sun],
  );
  const [front, setFront] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(0.8);
  // A phone keeps the panel closed (display:none) until the agent peeks:
  // no posts while it cannot be seen, one as soon as it can.
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const frontRef = useRef(0);
  const gen = useRef(0);
  frontRef.current = front;

  // Fit the 390px page into whatever width the panel has.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => {
      setVisible(node.clientWidth > 0);
      if (node.clientWidth > 0) setScale(Math.min(1, node.clientWidth / PHONE_W));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Fetch the draft into the hidden frame, debounced.
  useEffect(() => {
    if (!visible) return;
    const token = ++gen.current;
    const timer = window.setTimeout(() => {
      const back = frontRef.current === 0 ? 1 : 0;
      const frame = frames[back]?.current;
      if (!frame) return;
      setLoading(true);
      void fetch('/preview/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ draft: body }),
      })
        .then((response) => response.text())
        .then((html) => {
          if (token !== gen.current) return;
          const node = frames[back]?.current;
          if (!node) return;
          const reveal = () => {
            if (token !== gen.current) return;
            frontRef.current = back;
            setFront(back);
            setLoading(false);
          };
          node.addEventListener('load', reveal, { once: true });
          node.srcdoc = html;
          // A missed load event used to leave the previous template on screen.
          window.setTimeout(reveal, 800);
        })
        .catch(() => {
          if (token === gen.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `frames` is a stable pair of refs. Listing it would re-post every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, visible]);

  return (
    <div className="live-preview">
      <p className="live-label">
        {t('editor.livePreview.label')}
        {loading ? <span className="live-busy">{t('editor.livePreview.loading')}</span> : null}
      </p>
      <div
        className="live-phone"
        ref={box}
        style={{ blockSize: `${Math.round(PHONE_H * scale)}px` }}
      >
        {[0, 1].map((index) => (
          <iframe
            key={index}
            ref={frames[index]}
            title={t('editor.livePreview.title')}
            className={index === front ? 'live-frame is-front' : 'live-frame'}
            tabIndex={index === front ? 0 : -1}
            aria-hidden={index === front ? undefined : true}
            width={PHONE_W}
            height={PHONE_H}
            style={{ transform: `scale(${scale})` }}
          />
        ))}
      </div>
    </div>
  );
}
