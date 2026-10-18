import { SPIN_MAX, SPIN_MIN, SPIN_SMOOTH } from '@/features/listings/rich-media';

import { t } from '../../lib/i18n';
import { Message } from './Message';

export interface SpinFrame {
  id: string;
  url: string;
  width: number;
  height: number;
}

interface Props {
  /** A set the agent uploaded for the turn. Wins over the gallery. */
  frames: readonly SpinFrame[];
  /** The turn built from the gallery's photographs, by their angle (18 Oct 2026). */
  autoFrames: readonly SpinFrame[];
  /** The agent turned the gallery-built turn off. */
  off: boolean;
  onOff: (off: boolean) => void;
  onFrames: (frames: SpinFrame[]) => void;
  /** Uploads files in order through the EXIF-stripping path. */
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
}

function Strip({ frames }: { frames: readonly SpinFrame[] }) {
  return (
    <ol className="spin-strip">
      {frames.map((frame) => (
        <li key={frame.id}>
          <img src={frame.url} alt="" loading="lazy" />
        </li>
      ))}
    </ol>
  );
}

/**
 * A car's 360° turn.
 *
 * Since 18 Oct 2026 it is built from the photographs already in the gallery:
 * DeepSeek labels each one with where the camera stood, and one photo per
 * side, in walking order, is the turn. The agent shoots nothing extra and
 * can turn it off. A dedicated set (12 to 36 photographs walking once round
 * the car) is still accepted, and wins, for an agent who wants a smoother
 * turn. Fewer than SPIN_MIN sides and the page omits the turn rather than
 * jumping between two angles.
 */
export function SpinEditor({ frames, autoFrames, off, onOff, onFrames, onUpload, uploading }: Props) {
  return (
    <section className="spin-editor" aria-labelledby="spin-editor-title">
      <h2 id="spin-editor-title">{t('editor.spin.title')}</h2>

      {frames.length > 0 ? (
        <>
          <Strip frames={frames} />
          <p className="note">
            <Message path="editor.spin.count" values={{ count: frames.length, min: SPIN_MIN }} />
          </p>
          <button type="button" className="quiet" onClick={() => onFrames([])}>
            {t('editor.spin.clear')}
          </button>
        </>
      ) : off ? (
        <p className="hint">
          {t('editor.spin.off')}{' '}
          <button type="button" className="quiet" onClick={() => onOff(false)}>
            {t('editor.spin.on')}
          </button>
        </p>
      ) : autoFrames.length > 0 ? (
        <>
          <p className="hint">{t('editor.spin.auto')}</p>
          <Strip frames={autoFrames} />
          <button type="button" className="quiet" onClick={() => onOff(true)}>
            {t('editor.spin.hide')}
          </button>
        </>
      ) : (
        <p className="hint">
          <Message path="editor.spin.need" values={{ min: SPIN_MIN }} />
        </p>
      )}

      {frames.length === 0 ? (
        <details className="spin-own">
          <summary className="rules-toggle">{t('editor.spin.own')}</summary>
          <p className="hint">
            <Message path="editor.spin.hint" values={{ min: SPIN_SMOOTH, max: SPIN_MAX }} />
          </p>
          <label className="picker">
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                  .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
                  .slice(0, SPIN_MAX);
                event.target.value = '';
                if (files.length > 0) void onUpload(files);
              }}
            />
            <span>{uploading ? t('editor.uploading') : t('editor.spin.upload')}</span>
          </label>
        </details>
      ) : null}
    </section>
  );
}
