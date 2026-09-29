import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { EditorState } from '@/features/listings/editor';
import type { AgentProfile } from '@/features/agents/profile';

import { t } from '../../lib/i18n';
import { previewPayload } from '../../lib/listing-row';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  state: EditorState;
  photos: readonly EditorPhoto[];
  profile: AgentProfile;
}

/**
 * The live preview: the real listing page, in a phone.
 *
 * It replaces a hand-drawn miniature that could only ever look like the 1.x
 * page. The editor posts the row a save would write to /preview (a form
 * aimed at an iframe — no fetch, no HTML string handled here), and the
 * server renders the same ListingPage as /a/[slug], template and all.
 *
 * TWO FRAMES, so a change never flashes white: the next page loads in the
 * hidden frame and only then fades over the shown one. Switching template is
 * therefore a cross-fade from one finished page to the other (M12); with
 * reduced motion it is an instant swap. Posts are debounced so typing a
 * title does not reload the page on every key.
 *
 * The frame is laid out at a phone's 390 × 844 and scaled to fit, so 84svh
 * heroes and container units resolve the way a buyer's phone resolves them.
 */
const PHONE_W = 390;
const PHONE_H = 844;
const DEBOUNCE_MS = 450;

export function LivePreview({ state, photos, profile }: Props) {
  const body = useMemo(
    () => JSON.stringify(previewPayload(state, photos, profile, t('editor.livePreview.title'))),
    [state, photos, profile],
  );
  const [front, setFront] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(0.8);
  // A phone keeps the panel closed (display:none) until the agent peeks:
  // no posts while it cannot be seen, one as soon as it can.
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const forms = [useRef<HTMLFormElement>(null), useRef<HTMLFormElement>(null)];
  const inputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const pending = useRef<number | null>(null);
  const names = useMemo(() => {
    const id = Math.random().toString(36).slice(2, 8);
    return [`pv-a-${id}`, `pv-b-${id}`];
  }, []);

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

  // Post the draft into the hidden frame, debounced.
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      const back = front === 0 ? 1 : 0;
      const input = inputs[back]?.current;
      const form = forms[back]?.current;
      if (!input || !form) return;
      input.value = body;
      pending.current = back;
      setLoading(true);
      form.submit();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `front` is read, not watched: a swap must not trigger another post.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, visible]);

  const onLoad = (index: number) => {
    if (pending.current !== index) return;
    pending.current = null;
    setFront(index);
    setLoading(false);
  };

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
        {names.map((name, index) => (
          <iframe
            key={name}
            name={name}
            title={t('editor.livePreview.title')}
            className={index === front ? 'live-frame is-front' : 'live-frame'}
            tabIndex={index === front ? 0 : -1}
            aria-hidden={index === front ? undefined : true}
            width={PHONE_W}
            height={PHONE_H}
            style={{ transform: `scale(${scale})` }}
            onLoad={() => onLoad(index)}
          />
        ))}
      </div>
      {names.map((name, index) => (
        <form key={name} ref={forms[index]} method="post" action="/preview/" target={name} hidden>
          <input ref={inputs[index]} type="hidden" name="draft" />
        </form>
      ))}
    </div>
  );
}
