import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { TemplateId } from '@/types/listing';

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
  /** Surroundings already stored on the row. The preview does not look them up. */
  areaPlaces?: unknown;
  /**
   * The designs offered in the full-screen view on a phone, and what a tap on
   * one does. Without them the full screen has only its close button.
   */
  designs?: readonly TemplateId[];
  onDesign?: (template: TemplateId) => void;
}

/** Below this width the editor is one column: a phone, or a narrow window. */
const NARROW = '(max-width: 959px)';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
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
 *
 * ON A PHONE (12 Oct 2026) the same page shrunk into a 330px phone inside
 * the agent's phone was too small to judge, and it caught the finger: a
 * swipe meant for the editor scrolled the preview instead. There it is a
 * still picture of the first screen, untouchable, with one big button that
 * opens the real page full screen at the phone's own size, a row of designs
 * to tap underneath, and a close button. The phone's Back button closes it
 * too, because that is the button agents press.
 */
const PHONE_W = 390;
const PHONE_H = 844;
const DEBOUNCE_MS = 450;

export function LivePreview({ state, photos, profile, extras, sun, areaPlaces, designs, onDesign }: Props) {
  const narrow = useNarrow();
  const [full, setFull] = useState(false);
  const shown = narrow && full;
  const body = useMemo(
    () => JSON.stringify(previewPayload(state, photos, profile, t('editor.livePreview.title'), extras, sun, areaPlaces)),
    [state, photos, profile, extras, sun, areaPlaces],
  );
  const [front, setFront] = useState(0);
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState({ w: PHONE_W * 0.8, h: PHONE_H * 0.8 });
  // A phone keeps the panel closed (display:none) until the agent peeks:
  // no posts while it cannot be seen, one as soon as it can.
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const frontRef = useRef(0);
  const gen = useRef(0);
  frontRef.current = front;
  // Template, accent and sun are what the phone is supposed to show. A
  // description streaming in must not yank a scrolled phone back to the top.
  const resetKey = `${state.template ?? ''}|${state.accent ?? ''}|${sun ? '1' : '0'}`;
  const resetSeen = useRef(resetKey);
  const wantTop = useRef(false);
  if (resetSeen.current !== resetKey) {
    resetSeen.current = resetKey;
    wantTop.current = true;
  }

  // Fit the 390px page into whatever width the panel has.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => {
      setVisible(node.clientWidth > 0);
      if (node.clientWidth > 0) setSize({ w: node.clientWidth, h: node.clientHeight });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Full screen: the page at the phone's own width when that is at least
  // 390px (scale 1), otherwise 390px scaled down to fit; as tall as the
  // screen allows. Otherwise the 390 × 844 phone, scaled to the panel.
  const frameW = shown ? Math.max(PHONE_W, size.w) : PHONE_W;
  const scale = shown ? size.w / frameW : Math.min(1, size.w / PHONE_W);
  const frameH = shown ? Math.max(1, Math.round(size.h / scale)) : PHONE_H;
  // The thumbnail is the first screen and a little more: enough to judge the
  // design, short enough that the text and design sections stay in reach.
  const boxH = shown ? undefined : Math.round(PHONE_H * scale * (narrow ? 0.62 : 1));

  // Open and close. Opening adds a history entry, so the phone's Back
  // button closes the preview instead of leaving the editor.
  const open = () => {
    setFull(true);
    window.history.pushState({ livePreview: true }, '');
  };
  const close = () => {
    if ((window.history.state as { livePreview?: boolean } | null)?.livePreview) window.history.back();
    else setFull(false);
  };
  useEffect(() => {
    if (!shown) return undefined;
    const onPop = () => setFull(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
    // `close` reads only refs and the history; it does not need to re-bind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // Fetch the draft into the hidden frame, debounced.
  useEffect(() => {
    if (!visible) return;
    const token = ++gen.current;
    const jump = wantTop.current;
    if (jump) {
      try {
        frames[frontRef.current]?.current?.contentWindow?.scrollTo(0, 0);
      } catch {
        /* the frame may still be about:blank */
      }
    }
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
            try {
              if (jump) node.contentWindow?.scrollTo(0, 0);
            } catch {
              /* same-origin srcdoc; a thrown access just skips the snap */
            }
            if (jump) wantTop.current = false;
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

  const frameClass = (index: number) => (index === front ? 'live-frame is-front' : 'live-frame');
  const className = ['live-preview', narrow ? 'is-phone' : '', shown ? 'is-full' : ''].filter(Boolean).join(' ');

  return (
    <div className={className} role={shown ? 'dialog' : undefined} aria-modal={shown ? true : undefined} aria-label={shown ? t('editor.livePreview.title') : undefined}>
      {shown ? null : (
        <p className="live-label">
          {t('editor.livePreview.label')}
          {loading ? <span className="live-busy">{t('editor.livePreview.loading')}</span> : null}
        </p>
      )}
      <div
        className="live-phone"
        ref={box}
        style={boxH === undefined ? undefined : { blockSize: `${boxH}px` }}
        onClick={narrow && !shown ? open : undefined}
      >
        {[0, 1].map((index) => (
          <iframe
            key={index}
            ref={frames[index]}
            title={t('editor.livePreview.title')}
            className={frameClass(index)}
            tabIndex={index === front && (shown || !narrow) ? 0 : -1}
            aria-hidden={index === front && (shown || !narrow) ? undefined : true}
            width={frameW}
            height={frameH}
            style={{ transform: `scale(${scale})` }}
          />
        ))}
      </div>
      {narrow && !shown ? (
        <button type="button" className="live-open" onClick={open}>
          {t('editor.livePreview.open')}
        </button>
      ) : null}
      {shown ? (
        <div className="live-bar">
          {designs && designs.length > 0 && onDesign ? (
            <ul className="live-designs" aria-label={t('editor.livePreview.designs')}>
              {designs.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className="live-design"
                    aria-pressed={id === state.template}
                    onClick={() => onDesign(id)}
                  >
                    {t(`editor.templates.${id}`)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="live-bar-row">
            {loading ? <span className="live-busy">{t('editor.livePreview.loading')}</span> : <span />}
            <button type="button" className="live-close" onClick={close}>
              {t('editor.livePreview.close')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
