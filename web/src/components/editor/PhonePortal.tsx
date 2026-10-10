import { useEffect, useRef, useState } from 'react';

import { t } from '../../lib/i18n';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { Message } from './Message';

/** One photograph the phone sent, as the inbox holds it (0036). */
export interface InboxPhoto {
  id: string;
  url: string;
  path: string;
  width: number;
  height: number;
}

interface Props {
  signedIn: boolean;
  /** The listing row the phone will add to, created on demand. */
  ensureListing: () => Promise<string | undefined>;
  /**
   * Takes arrived photographs into the editor's own list and saves them.
   * Resolves with the inbox ids it kept; any other id was over the 25-photo
   * cap. Rejects when the save failed, and the inbox is then left alone so
   * the next poll tries again.
   */
  onPhotos: (photos: InboxPhoto[]) => Promise<Set<string>>;
}

interface Portal {
  id: string;
  expiresAt: string;
}

const POLL_MS = 3_000;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * "Upload from your phone": a QR code the agent scans, and the photographs
 * that arrive while it is open (supabase/migrations/0036_phone_portal.sql).
 *
 * The phone writes into an inbox, never into the listing. This panel polls the
 * inbox while it is open, hands each photograph to the editor — which adds it
 * to its own list and saves the ordinary way, so the editor stays the one
 * writer of `media` — and only then deletes the inbox row.
 *
 * Polling, not Realtime: three seconds while a panel is open is cheap, and it
 * needs no channel or publication set up on the project.
 */
export function PhonePortal({ signedIn, ensureListing, onPhotos }: Props) {
  const [portal, setPortal] = useState<Portal | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [arrived, setArrived] = useState(0);
  const [qr, setQr] = useState<{ box: number; d: string } | undefined>(undefined);
  const listingRef = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  // The editor passes a fresh function each render; the poll reads the latest.
  const onPhotosRef = useRef(onPhotos);
  onPhotosRef.current = onPhotos;

  const open = async () => {
    if (!supabaseConfigured) return;
    setOpening(true);
    setFailed(false);
    setExpired(false);
    try {
      const listingId = await ensureListing();
      if (!listingId) throw new Error('no listing');
      listingRef.current = listingId;
      const { data } = await supabase().auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error('no session');
      // The server makes the portal as this agent and draws the QR, so the
      // editor never downloads the QR encoder (api/phone-portal.ts).
      const response = await fetch('/api/phone-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ listingId }),
      });
      if (!response.ok) throw new Error('no portal');
      const made = (await response.json()) as Partial<Portal> & { qr?: { box: number; d: string } };
      if (!made.id || !made.expiresAt || !made.qr) throw new Error('no portal');
      const next = { id: made.id, expiresAt: made.expiresAt };
      setQr(made.qr);
      setPortal(next);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  };

  const close = () => {
    const current = portal;
    setPortal(undefined);
    setQr(undefined);
    setExpired(false);
    if (current) void supabase().rpc('close_photo_portal', { p_portal_id: current.id });
  };

  // Collect what the phone sent, while the panel is open.
  useEffect(() => {
    if (!portal) return undefined;
    let stopped = false;

    const collect = async () => {
      if (busy.current || stopped || !listingRef.current) return;
      if (Date.parse(portal.expiresAt) <= Date.now()) {
        setExpired(true);
        return;
      }
      busy.current = true;
      try {
        const client = supabase();
        const { data } = await client
          .from('photo_inbox')
          .select('id, url, path, width, height')
          .eq('listing_id', listingRef.current)
          .order('created_at', { ascending: true });
        const rows = (data ?? []) as InboxPhoto[];
        if (rows.length === 0 || stopped) return;

        const kept = await onPhotosRef.current(rows);
        // Over the cap: the public copy goes too, so it is not reachable.
        const refused = rows.filter((row) => !kept.has(row.id)).map((row) => row.path);
        if (refused.length > 0) await client.storage.from('derived').remove(refused);
        await client.from('photo_inbox').delete().in('id', rows.map((row) => row.id));
        setArrived((count) => count + rows.filter((row) => kept.has(row.id)).length);
      } catch {
        // The save failed: the rows stay in the inbox for the next poll.
      } finally {
        busy.current = false;
      }
    };

    void collect();
    const timer = window.setInterval(() => void collect(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [portal]);

  // Leaving the editor closes the door behind it.
  useEffect(
    () => () => {
      if (portal) void supabase().rpc('close_photo_portal', { p_portal_id: portal.id });
    },
    [portal],
  );

  if (!supabaseConfigured) return null;
  if (!signedIn) return <p className="field-hint">{t('editor.phone.signIn')}</p>;

  if (!portal) {
    return (
      <div className="phone-portal">
        <button type="button" className="secondary phone-open" onClick={() => void open()} disabled={opening}>
          {t('editor.phone.open')}
        </button>
        {failed ? (
          <p className="field-error" role="alert">
            {t('editor.phone.failed')}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="phone-portal is-open" aria-label={t('editor.phone.title')}>
      <div className="phone-portal-code">
        {qr && !expired ? (
          <svg
            viewBox={`0 0 ${qr.box} ${qr.box}`}
            role="img"
            aria-label={t('editor.phone.title')}
            shapeRendering="crispEdges"
          >
            <rect width={qr.box} height={qr.box} fill="#ffffff" />
            <path d={qr.d} fill="#15140f" />
          </svg>
        ) : null}
      </div>
      <div className="phone-portal-text">
        <h3>{t('editor.phone.title')}</h3>
        <p>{t('editor.phone.lead')}</p>
        {expired ? (
          <p className="field-error" role="status">
            {t('editor.phone.expired')}
          </p>
        ) : (
          <p className="field-hint">
            <Message path="editor.phone.expires" values={{ time: timeOf(portal.expiresAt) }} />
          </p>
        )}
        <p className="phone-portal-count" role="status" aria-live="polite">
          {arrived > 0 ? (
            <Message path="editor.phone.arrived" values={{ count: arrived }} />
          ) : (
            t('editor.phone.waiting')
          )}
        </p>
        <div className="phone-portal-actions">
          {expired ? (
            <button type="button" className="secondary" onClick={() => void open()} disabled={opening}>
              {t('editor.phone.renew')}
            </button>
          ) : null}
          <button type="button" className="quiet" onClick={close}>
            {t('editor.phone.close')}
          </button>
        </div>
      </div>
    </section>
  );
}
