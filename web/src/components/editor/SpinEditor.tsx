import { SPIN_MAX, SPIN_MIN } from '@/features/listings/rich-media';

import { t } from '../../lib/i18n';
import { Message } from './Message';

export interface SpinFrame {
  id: string;
  url: string;
  width: number;
  height: number;
}

interface Props {
  frames: readonly SpinFrame[];
  onFrames: (frames: SpinFrame[]) => void;
  /** Uploads files in order through the EXIF-stripping path. */
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
}

/**
 * A car's 360° turn (P7): 12 to 36 photographs taken walking once round it,
 * the same distance and height each time. Uploaded in filename order, which
 * is the camera's shooting order. Fewer than twelve and the page omits the
 * spin rather than jerking between three angles.
 */
export function SpinEditor({ frames, onFrames, onUpload, uploading }: Props) {
  return (
    <section className="spin-editor" aria-labelledby="spin-editor-title">
      <h2 id="spin-editor-title">{t('editor.spin.title')}</h2>
      <p className="hint">
        <Message path="editor.spin.hint" values={{ min: SPIN_MIN, max: SPIN_MAX }} />
      </p>

      {frames.length > 0 ? (
        <>
          <ol className="spin-strip">
            {frames.map((frame) => (
              <li key={frame.id}>
                <img src={frame.url} alt="" loading="lazy" />
              </li>
            ))}
          </ol>
          <p className="note">
            <Message path="editor.spin.count" values={{ count: frames.length, min: SPIN_MIN }} />
          </p>
          <button type="button" className="quiet" onClick={() => onFrames([])}>
            {t('editor.spin.clear')}
          </button>
        </>
      ) : (
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
      )}
    </section>
  );
}
