import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  blockers,
  canPublish,
  ESSENTIAL_FACTS,
  MAX_IMAGES,
  nextScreen,
  SCREEN_STEP,
  SCREENS,
  screenBlockers,
  screenOf,
  type EditorState,
  type Screen,
} from '@/features/listings/editor';
import { autoTitle } from '@/features/listings/auto-title';
import { blankFacts, reconcileFacts } from '@/features/listings/fact-entry';
import { photoCoverage } from '@/features/listings/photo-coverage';
import { isPhotoRoom, type PhotoRoom } from '@/features/listings/photo-rooms';
import { LISTING_CATEGORIES, schemaFor } from '@/features/listings/schemas';
import { CATALOGUE, NEW_LISTING_TEMPLATE, pickerTemplates } from '@/features/templates/manifest';
import { suggestTemplate } from '@/features/templates/suggest';
import { cleanPlanRooms, cleanVideo, type ListingVideo } from '@/features/listings/rich-media';
import type { MediaExtras } from '../../lib/listing-row';
import { groundedDescription, type CopyTone } from '@/features/listings/listing-copy';
import { nextAgentDescription } from '@/features/listings/agent-copy';

import { isProfileComplete } from '@/features/agents/profile';
import { DEFAULT_ACCENT, isAccentId } from '@/features/agents/accents';

import { t } from '../../lib/i18n';
import { loadEntitlement } from '../../lib/entitlement';
import { createDraft, uploadOriginal } from '../../lib/listing-draft';
import { coarseOrigin } from '@/features/sun/anchor';
import { areaKey, areaSettled, requestArea, type AreaClientStatus } from '../../lib/area-request';
import { allPlaces, type AreaPlaces } from '@/features/listings/area-note';
import { stripAndResize, uploadDerived } from '../../lib/listing-photo';
import { loadListing, publishListing, saveListing } from '../../lib/listing-save';
import { loadProfile } from '../../lib/profile';
import { recordEditorEvent } from '../../lib/editor-events';
import { recordListingEvent } from '../../lib/listing-events';
import { splitSse } from '@/features/listings/sse';
import type { AgentProfile } from '@/features/agents/profile';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { ConsentStep } from './ConsentStep';
import { DescriptionStep, sourceOf, type SuggestAnswer, type SuggestSource } from './DescriptionStep';
import { DetailsStep } from './DetailsStep';
import { LivePreview } from './LivePreview';
import { PlanEditor, type PlanDraft } from './PlanEditor';
import { SpinEditor, type SpinFrame } from './SpinEditor';
import { PublishStep } from './PublishStep';
import { DisclosuresStep } from './DisclosuresStep';
import { FactsStep } from './FactsStep';
import { Message } from './Message';
import { FilmFile } from './FilmFile';
import { PhonePortal, type InboxPhoto } from './PhonePortal';
import { PhotoAdvice } from './PhotoAdvice';
import { PhotoChecklist } from './PhotoChecklist';
import { PhotosStep, type EditorPhoto } from './PhotosStep';
import { PlateStep } from './PlateStep';
import { RoomsStep } from './RoomsStep';
import { TemplateStep } from './TemplateStep';
import { clearDraft, useDraft } from './useDraft';

/**
 * The editor island (Stage E).
 *
 * All the rules live in @/features/listings/editor — what blocks publishing,
 * which steps a category has, where a returning seller lands. This file is
 * the presentation of those rules and holds no product logic of its own, so
 * the answer to "why can I not publish" is testable without a browser.
 *
 * The draft is kept in localStorage (useDraft), because PRD §4 locks "no
 * account until publish" and until the seller pays there is nowhere else to
 * put their work.
 *
 * Publish is gated on entitlement with a fail-closed read from
 * `loadEntitlement`. A failed read stays 'unknown' and canPublish stays
 * false (CLAUDE.md §8). The draft is kept in localStorage (useDraft);
 * entitlement is never stored there.
 */

const START: EditorState = {
  title: '',
  price: 0,
  indexable: false,
  prePortal: false,
  photoCount: 0,
  facts: [],
  description: '',
  template: NEW_LISTING_TEMPLATE,

  // ========================== HUMAN REVIEW ==========================
  // CLAUDE.md §8: I may build the paywall and may NOT decide entitlement.
  //
  // 'unknown' is the fail-closed value — it blocks publishing, which is
  // the correct behaviour for a client that has asked nobody. loadEntitlement
  // replaces this once the session exists, and that read must still produce
  // 'unknown' on any error rather than 'paid' or 'free'.
  //
  // A seller can still reach the preview with this value, which is the
  // point: seeing the finished page is the conversion moment.
  // ==================================================================
  entitlement: 'unknown',
};

/**
 * How long publish waits for the neighbourhood (decided 7 Oct 2026).
 *
 * It was six seconds, which a cold Overpass lookup (five to nine on a good
 * minute) usually lost, so listings went live with no map. Twenty, with a
 * line saying what it is waiting for; after that it publishes anyway and the
 * server's background lookup (waitUntil in /api/area) fills the page in.
 */
const AREA_AT_PUBLISH_MS = 20_000;

/** How long the description step waits for a lookup still working. */
const AREA_WAIT_MS = 25_000;

/** Asking /api/area again after a failed or unfinished answer. */
const AREA_RETRY_MS = [5_000, 15_000, 30_000] as const;

/** Drawing two images and uploading them: a few seconds on a phone on 4G. */
const SHARE_IMAGES_AT_PUBLISH_MS = 12_000;

/** The paragraph a tone chip writes before the server answers. */
function draftInVoice(
  category: EditorState['category'],
  facts: EditorState['facts'],
  city: string | undefined,
  previous: string,
  voice: CopyTone,
): string {
  const where = city?.trim();
  if (category === 'vehicle') {
    return groundedDescription(
      { category: 'vehicle', facts, ...(where ? { city: where } : {}) },
      { tone: voice, alternate: previous.trim() !== '' },
    );
  }
  return nextAgentDescription(
    { category: 'property', facts, ...(where ? { city: where } : {}) },
    previous,
    voice,
  );
}

export default function Editor() {
  const [state, setState] = useState<EditorState>(START);
  /**
   * Which of the four screens is open (11 Oct 2026; editor.ts, "FOUR
   * SCREENS"). The eleven steps still exist inside them — a blocker still
   * names its step — but the agent only ever moves between four.
   */
  const [screen, setScreen] = useState<Screen>('photos');
  /**
   * True until the agent picks a step themselves. Opening a saved listing
   * lands on the first gap (`nextStep`); once they tap Next, Back or a
   * step, that choice sticks — a photo finishing its upload must not
   * yank them to a later screen.
   */
  const followGap = useRef(true);
  /**
   * A brand-new listing gets its design chosen for it on the "ready" screen
   * (suggestTemplate). One opened from a draft or the dashboard keeps the
   * design it has; one the agent changed by hand keeps theirs.
   */
  const freshListing = useRef(true);
  const templateChosen = useRef(false);

  /**
   * The photographs live HERE and not in EditorState.
   *
   * EditorState is the shared, serialisable surface the rules run on. An
   * object URL backed by a browser File is neither shared nor serialisable,
   * so what crosses into the state machine is the only part it needs: how
   * many there are. Keeping the files out is what stops photoCount and the
   * actual photos ever disagreeing.
   */
  const [photos, setPhotos] = useState<EditorPhoto[]>([]);
  // For callbacks that outlive a render (the phone poll in PhonePortal).
  const photosRef = useRef(photos);
  photosRef.current = photos;

  /**
   * Where this listing's accent came from, so each source knows what it may
   * override (plan 12g, item 4). The agent's own pick wins over everything;
   * a brand accent set on /me wins over the cover; the cover fills in only
   * when neither has spoken. Not saved: a listing loaded or restored with an
   * accent counts as the agent's pick.
   */
  const accentSource = useRef<'manual' | 'brand' | 'cover' | undefined>(undefined);
  const coverTone = photos[0]?.tone;

  // The cover suggests the accent while nobody else has (see accentSource).
  // A new cover re-suggests; a cover with no clear colour hands the listing
  // back to the default rather than keeping the last photo's.
  useEffect(() => {
    if (accentSource.current === 'manual' || accentSource.current === 'brand') return;
    if (coverTone) {
      accentSource.current = 'cover';
      setState((current) => (current.accent === coverTone ? current : { ...current, accent: coverTone }));
    } else if (accentSource.current === 'cover') {
      accentSource.current = undefined;
      setState(({ accent: _dropped, ...rest }) => rest);
    }
  }, [coverTone]);

  /**
   * P7 extras, held beside the photographs for the same reason they are:
   * URLs and sizes the rules do not need. The floor plan with the rooms drawn
   * on it (property), and a car's 360° frames. Saved in `media` with the
   * photographs (lib/listing-row.ts toMedia).
   */
  const [plan, setPlan] = useState<PlanDraft | undefined>(undefined);
  const [spin, setSpin] = useState<SpinFrame[]>([]);
  const [video, setVideo] = useState<ListingVideo | undefined>(undefined);
  const [extraUploading, setExtraUploading] = useState(false);
  const extras = useMemo<MediaExtras>(
    () => ({ plan, spin, ...(video ? { video } : {}) }),
    [plan, spin, video],
  );
  const extrasRef = useRef(extras);
  extrasRef.current = extras;

  /**
   * The plate and its ownership declaration.
   *
   * Held HERE and nowhere else — not in EditorState, not in the saved draft.
   * The plate is a lookup key that must never be published (§7), and the
   * surest way to keep it off the page is to give it nowhere to travel to.
   */
  const [plate, setPlate] = useState('');
  const [declaredOwner, setDeclaredOwner] = useState(false);

  /**
   * The draft row's id, once one exists.
   *
   * Created lazily — on the first photo, not on page load — so opening /new
   * and closing it again does not litter the table with empty rows.
   */
  const listingId = useRef<string | null>(null);
  const slug = useRef<string | null>(null);
  const skipDraftRestore = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [savedRow, setSavedRow] = useState<{ id: string; slug: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  /**
   * The agent's own details, kept because the PREVIEW needs them.
   *
   * The bar at the top of every listing carries the agency name and the
   * accent, so a preview without them is a preview of somebody else's page.
   */
  const [profile, setProfile] = useState<AgentProfile>({});
  const [publishedUrl, setPublishedUrl] = useState<string | undefined>(undefined);
  const [publishing, setPublishing] = useState(false);
  // What publish is waiting on, when it is waiting on something nameable.
  const [publishNote, setPublishNote] = useState<string | undefined>();

  /**
   * Why the last publish, or the last save, did not work.
   *
   * Both used to be swallowed — `.catch(() => undefined)` on the save and no
   * branch at all on a refused publish. The agent saw a button that stopped
   * spinning and no link, which is indistinguishable from a slow network, and
   * the one case that actually happened (photographs not yet written to the
   * row) looked like nothing at all.
   */
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [suggesting, setSuggesting] = useState(false);
  /** Why the last suggestion failed, by the server's own error code. */
  const [suggestFailed, setSuggestFailed] = useState<string | false>(false);
  /**
   * Where the text in the box came from: the model, or the writer that needs
   * none — and if the latter, why. Shown under the box, because "the AI wrote
   * this" and "the AI never ran" otherwise look identical, and the second one
   * usually means a missing DEEPSEEK_API_KEY on the Worker.
   */
  const [suggestSource, setSuggestSource] = useState<SuggestSource | undefined>(undefined);
  const [peekOpen, setPeekOpen] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const client = supabase();
    void client.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));

    const { data: sub } = client.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  /**
   * Whether the agent's profile can brand this listing.
   *
   * Re-read whenever the session changes, and NOT cached across sign-ins: the
   * previous user's answer is not this one's.
   *
   * Fails closed. Any failure — signed out, no row, a read that threw —
   * leaves `sellerReady` false, which blocks publishing rather than shipping a
   * page whose only button goes nowhere. The seller still reaches the preview;
   * `canAdvance` only consults the blockers belonging to the step it is asked
   * about, and this one belongs to publish.
   */
  useEffect(() => {
    if (!supabaseConfigured || !signedIn) {
      setState((current) => ({ ...current, sellerReady: false, entitlement: 'unknown' }));
      return;
    }

    let live = true;

    void loadProfile()
      .then((result) => {
        if (!live) return;
        const ready = 'profile' in result && isProfileComplete(result.profile);
        if ('profile' in result) {
          setProfile(result.profile);
          // Olive is the column's default, so it says nothing about the
          // agent's taste: only a colour they chose counts as a brand.
          const brand =
            isAccentId(result.profile.accent) && result.profile.accent !== DEFAULT_ACCENT
              ? result.profile.accent
              : undefined;
          setState((current) => {
            if (current.accent && accentSource.current === undefined) accentSource.current = 'manual';
            const useBrand = brand !== undefined && accentSource.current !== 'manual';
            if (useBrand) accentSource.current = 'brand';
            return { ...current, sellerReady: ready, ...(useBrand ? { accent: brand } : {}) };
          });
        } else {
          setState((current) => ({ ...current, sellerReady: ready }));
        }
      })
      .catch(() => {
        if (live) setState((current) => ({ ...current, sellerReady: false }));
      });

    // HUMAN REVIEW: entitlement is READ, never inferred. A failed read stays
    // 'unknown' and publishing stays blocked (CLAUDE.md §8).
    void loadEntitlement().then((entitlement) => {
      if (live) setState((current) => ({ ...current, entitlement }));
    });

    // The guard is for the sign-out that lands mid-request: without it a
    // resolved read from the previous session sets sellerReady true after the
    // effect that should have cleared it has already run.
    return () => {
      live = false;
    };
  }, [signedIn]);

  /**
   * Uploads anything newly picked, one at a time.
   *
   * Sequential rather than parallel: this runs on a phone on cellular, and
   * fifteen simultaneous uploads of camera-sized files is how you get fifteen
   * timeouts instead of fifteen photos.
   *
   * Each photo's status is updated on its own, so a single failure is
   * attributable rather than sinking the batch.
   *
   * After the batch, the row is saved. Photos used to live only in this
   * component's memory: advancing a step before `publicUrl` existed wrote
   * empty `media`, and the dashboard draft showed no photographs.
   */
  /**
   * One extra image (a floor plan, a spin frame) through the photographs'
   * own path: the original to the private bucket, a re-encoded copy — no
   * EXIF — to the public one. Undefined on any failure; the agent can retry.
   */
  const uploadExtra = async (file: File): Promise<{ url: string; width: number; height: number } | undefined> => {
    if (!supabaseConfigured || !signedIn || !state.category) return undefined;
    try {
      if (!listingId.current) {
        const draft = await createDraft(state.category);
        listingId.current = draft.id;
        slug.current = draft.slug;
        setSavedRow({ id: draft.id, slug: draft.slug });
      }
      const original = await uploadOriginal(listingId.current, file);
      if ('error' in original) return undefined;
      const processed = await stripAndResize(file);
      if (!processed) return undefined;
      const published = await uploadDerived(listingId.current, original.path, processed);
      if ('error' in published) return undefined;
      return { url: published.url, width: processed.width, height: processed.height };
    } catch {
      return undefined;
    }
  };

  /** The listing row, created on demand — the phone needs one to add to. */
  const ensureListing = async (): Promise<string | undefined> => {
    if (!supabaseConfigured || !signedIn || !state.category) return undefined;
    if (!listingId.current) {
      const draft = await createDraft(state.category);
      listingId.current = draft.id;
      slug.current = draft.slug;
      setSavedRow({ id: draft.id, slug: draft.slug });
    }
    return listingId.current;
  };

  /**
   * Photographs the phone sent (PhonePortal). They are already public copies
   * — stripped and re-encoded on the phone, checked again by the server — so
   * they join the list as uploaded and are saved the ordinary way. The
   * editor stays the one writer of `media`.
   *
   * Keyed by inbox id, so a poll that repeats after a failed save cannot add
   * the same photograph twice. Over the cap, the newest are not kept.
   */
  const takeFromPhone = async (arrived: InboxPhoto[]): Promise<Set<string>> => {
    const current = photosRef.current;
    const kept = new Set<string>();
    const fresh: EditorPhoto[] = [];
    for (const photo of arrived) {
      const id = `phone:${photo.id}`;
      if (current.some((existing) => existing.id === id)) {
        kept.add(photo.id);
        continue;
      }
      if (current.length + fresh.length >= MAX_IMAGES) continue;
      kept.add(photo.id);
      fresh.push({
        id,
        url: photo.url,
        name: '',
        publicUrl: photo.url,
        width: photo.width,
        height: photo.height,
        status: 'uploaded',
      });
    }
    if (fresh.length === 0) return kept;

    const next = [...current, ...fresh];
    photosRef.current = next;
    setPhotos(next);
    setState((existing) => ({ ...existing, photoCount: next.length }));

    const id = listingId.current;
    if (id) {
      const result = await saveListing(id, stateRef.current, next, extrasRef.current).catch(
        () => ({ error: 'failed' }) as const,
      );
      if ('error' in result) {
        setFailure(t('errors.upload'));
        throw new Error('save failed');
      }
    }
    return kept;
  };

  const uploadPlan = async (file: File) => {
    setExtraUploading(true);
    const done = await uploadExtra(file);
    setExtraUploading(false);
    if (done) setPlan({ ...done, rooms: [] });
    else setFailure(t('editor.uploadFailed'));
  };

  const uploadSpin = async (files: File[]) => {
    setExtraUploading(true);
    const frames: SpinFrame[] = [];
    for (const [index, file] of files.entries()) {
      const done = await uploadExtra(file);
      if (done) frames.push({ id: `spin-${index}-${file.name}`, ...done });
    }
    setExtraUploading(false);
    setSpin(frames);
  };

  const uploadPending = async (current: EditorPhoto[], category: EditorState['category']) => {
    if (!supabaseConfigured || !signedIn || !category) return;

    const pending = current.filter((photo) => photo.status === 'local' && photo.file);
    if (pending.length === 0) return;

    let latest = current;
    const mark = (id: string, patch: Partial<EditorPhoto>) => {
      latest = latest.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo));
      setPhotos(latest);
    };

    try {
      if (!listingId.current) {
        const draft = await createDraft(category);
        listingId.current = draft.id;
        slug.current = draft.slug;
        setSavedRow({ id: draft.id, slug: draft.slug });
      }
    } catch {
      for (const photo of pending) mark(photo.id, { status: 'failed' });
      return;
    }

    for (const photo of pending) {
      if (!photo.file) continue;
      mark(photo.id, { status: 'uploading' });

      const result = await uploadOriginal(listingId.current, photo.file);
      if ('error' in result) {
        mark(photo.id, { status: 'failed' });
        continue;
      }

      /*
       * The ORIGINAL is now safe in the private bucket. What a buyer sees is
       * a second, re-encoded copy in `derived`.
       *
       * The re-encode is what makes writing to a public bucket safe at all:
       * it decodes to pixels and rebuilds the file, so EXIF — and the GPS in
       * a photograph of somebody's home — is never carried rather than being
       * stripped by a step that could be skipped. See 0012 and listing-photo.
       *
       * A failure here is NOT a failed upload. The original is stored, the
       * seller's work is not lost, and the real pipeline can produce the
       * public copy later. It only means this photo has no URL yet.
       */
      const processed = await stripAndResize(photo.file);
      if (!processed) {
        // The browser could not decode it — an unsupported camera format is
        // the usual reason. The original is safe and the pipeline can produce
        // a public copy later, but this photo has no URL, so it is marked
        // failed rather than shown as done: a photo the page cannot display
        // must not look published.
        mark(photo.id, { status: 'failed', path: result.path });
        continue;
      }

      const published = await uploadDerived(listingId.current, result.path, processed);
      mark(photo.id, {
        status: 'error' in published ? 'failed' : 'uploaded',
        path: result.path,
        ...('error' in published ? {} : { publicUrl: published.url }),
        width: processed.width,
        height: processed.height,
        ...(processed.check ? { check: processed.check } : {}),
        ...(processed.tone ? { tone: processed.tone } : {}),
      });
    }

    const id = listingId.current;
    if (id) {
      const result = await saveListing(id, stateRef.current, latest, extrasRef.current).catch(
        () => ({ error: 'failed' }) as const,
      );
      setFailure('error' in result ? t('errors.upload') : undefined);
    }
  };

  /**
   * The suggested description.
   *
   * Asked of the server, because the model key is a secret and this is a
   * browser (see web/src/pages/api/description.ts). What comes back is put in
   * the textarea AND recorded as `generatedDescription`, which is what makes
   * the E6 gate work: the seller has to edit it before they can publish,
   * because the claim on the page is theirs and not the model's.
   *
   * The row has to exist first — the facts are read from it, not sent — so
   * this is only offered once a draft has been created, which happens on the
   * first photo.
   */
  const canSuggest = Boolean(savedRow?.id ?? listingId.current) && supabaseConfigured && signedIn;

  const descriptionRef = useRef(state.description);
  descriptionRef.current = state.description;

  const [tone, setTone] = useState<CopyTone>('pro');
  // Street midpoint, rounded, for the sun template's preview. Not part of
  // EditorState: saving it onto location would publish a pin.
  const [sunPoint, setSunPoint] = useState<{ lat: number; lng: number } | undefined>();
  // The row's surroundings, keyed by the address they belong to. A changed
  // street must not keep showing the previous map.
  const [surroundings, setSurroundings] = useState<{ key: string; places: unknown } | undefined>();
  // Where the neighbourhood lookup stands, for the address it was asked for.
  const [area, setArea] = useState<{ key: string; status: AreaClientStatus; count?: number } | undefined>();
  const areaRef = useRef(area);
  areaRef.current = area;
  const suggestGen = useRef(0);

  const suggest = (voice?: CopyTone) => {
    const id = listingId.current;
    if (!id) return;

    const voiceNow = voice ?? tone;
    const ticket = ++suggestGen.current;
    const previous = descriptionRef.current.trim();
    setSuggesting(true);
    setSuggestFailed(false);

    void (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('no_session');

        /*
         * Save first. The server reads the facts and the address from the
         * ROW, never from this request — and arriving at this step fires
         * the suggestion while the save of the step just left is still in
         * flight. The server then read an older row, often one with no
         * facts yet, and the editor reported a failure. A save that fails
         * here is not fatal: the row may already be current.
         */
        await saveListing(id, stateRef.current, photos, extrasRef.current).catch(() => undefined);

        const response = await fetch('/api/description', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ listingId: id, previous, tone: voiceNow }),
        });
        if (!response.ok) {
          const failed = (await response.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(typeof failed.error === 'string' ? failed.error : String(response.status));
        }

        const streamed = (response.headers.get('content-type') ?? '').includes(
          'text/event-stream',
        );

        let text = '';
        let source: SuggestSource | undefined;

        if (streamed && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let draft = '';

          while (true) {
            if (ticket !== suggestGen.current) return;
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const split = splitSse(buffer);
            buffer = split.rest;
            for (const event of split.events) {
              if (event.event === 'token') {
                try {
                  const body = JSON.parse(event.data) as { t?: unknown };
                  if (typeof body.t === 'string') {
                    draft += body.t;
                    const snapshot = draft;
                    setState((current) => ({ ...current, description: snapshot }));
                  }
                } catch {
                  /* a truncated JSON line waits in rest */
                }
              }
              if (event.event === 'done') {
                const body = JSON.parse(event.data) as SuggestAnswer;
                if (typeof body.error === 'string') throw new Error(body.error);
                text = typeof body.text === 'string' ? body.text.trim() : draft.trim();
                source = sourceOf(body);
              }
            }
          }
        } else {
          const body = (await response.json()) as SuggestAnswer;
          text = typeof body.text === 'string' ? body.text.trim() : '';
          source = sourceOf(body);
        }

        if (ticket !== suggestGen.current) return;
        if (!text) throw new Error('empty');

        setSuggestSource(source);
        setState((current) => ({
          ...current,
          description: text,
          generatedDescription: text,
        }));

        // No neighbourhood yet: the box keeps this text, and the effect
        // below asks again once /api/area has stored the area — unless the
        // seller has edited it by then.
      } catch (error) {
        if (ticket === suggestGen.current) setSuggestFailed(error instanceof Error ? error.message : 'failed');
      } finally {
        if (ticket === suggestGen.current) setSuggesting(false);
      }
    })();
  };

  /**
   * Offers one automatically, once, on an empty description.
   *
   * The seller is here to get a page out in four minutes. Arriving at "תיאור"
   * to find a blank box is the step they stall on, and a draft they can edit
   * is a far better starting point than a cursor. Pressing the button again
   * replaces it; a description they have already written is never overwritten.
   */
  const autoSuggested = useRef(false);
  /*
   * WAIT FOR THE NEIGHBOURHOOD, briefly (7 Oct 2026). The description used to
   * be written the moment the step opened, usually before the area lookup had
   * landed, so it had no neighbourhood paragraph and never got one. Now a
   * property waits while the lookup is still working — up to AREA_WAIT_MS,
   * then writes without it — and is rewritten once when the area lands, if
   * the seller has not touched the text.
   */
  const [areaWaitOver, setAreaWaitOver] = useState(false);
  useEffect(() => {
    if (screen !== 'ready') return;
    const timer = window.setTimeout(() => setAreaWaitOver(true), AREA_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [screen]);
  const waitingForArea =
    screen === 'ready' &&
    state.category === 'property' &&
    !areaWaitOver &&
    area !== undefined &&
    area.key === areaKey(state.city, state.street) &&
    area.status === 'working';

  useEffect(() => {
    if (screen !== 'ready' || autoSuggested.current) return;
    if (!canSuggest || state.description.trim() !== '') return;
    if (waitingForArea) return;
    autoSuggested.current = true;
    suggest();
    // `suggest` is stable enough for this: it reads the listing id from a ref
    // and guards on `suggesting`, so it cannot fire twice for one arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, canSuggest, state.description, waitingForArea]);

  // No model to ask (signed out, or no listing row yet): the box still
  // arrives written, from the agent's own answers, so "ready" is never a
  // blank box. The model rewrites it later if it can.
  useEffect(() => {
    if (screen !== 'ready' || canSuggest || state.description.trim() !== '') return;
    const drafted = draftInVoice(state.category, state.facts, state.city, '', tone);
    if (drafted.trim()) {
      setState((current) =>
        current.description.trim() === ''
          ? { ...current, description: drafted, generatedDescription: drafted }
          : current,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, canSuggest]);

  // The area landed after a description was written without it: write it
  // again, once per address, unless the seller has edited the text.
  const rewroteForArea = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (screen !== 'ready' || state.category !== 'property') return;
    const key = areaKey(state.city, state.street);
    if (!key || area?.key !== key || area.status !== 'ready') return;
    if (!suggestSource || suggestSource.area || suggesting) return;
    if (state.description.trim() !== (state.generatedDescription ?? '').trim()) return;
    if (rewroteForArea.current === key) return;
    rewroteForArea.current = key;
    suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, area, suggestSource, suggesting, state.description, state.generatedDescription]);

  const changePhotos = (next: EditorPhoto[]) => {
    setPhotos(next);
    setState((current) => ({ ...current, photoCount: next.length }));
    void uploadPending(next, state.category);
  };

  const acceptVideo = (next: ListingVideo) => {
    setVideo(next);
    const id = savedRow?.id ?? listingId.current;
    if (!id || !supabaseConfigured || !signedIn) return;
    void saveListing(id, stateRef.current, photosRef.current, { ...extrasRef.current, video: next }).catch(
      () => undefined,
    );
  };

  const labelRoom = (id: string, room: PhotoRoom) => {
    changePhotos(photosRef.current.map((photo) => (photo.id === id ? { ...photo, room } : photo)));
  };

  const makeCover = (id: string) => {
    const current = photosRef.current;
    const index = current.findIndex((photo) => photo.id === id);
    if (index <= 0) return;
    const next = current.slice();
    const [picked] = next.splice(index, 1);
    if (!picked) return;
    next.unshift(picked);
    changePhotos(next);
  };

  const rotatePhoto = (id: string) => {
    const listing = savedRow?.id ?? listingId.current;
    const source = photosRef.current.find((photo) => photo.id === id)?.publicUrl;
    if (!listing || !source) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        void uploadDerived(listing, `rotate-${Date.now()}.webp`, {
          blob,
          width: canvas.width,
          height: canvas.height,
        }).then((uploaded) => {
          if ('error' in uploaded) return;
          changePhotos(
            photosRef.current.map((photo) =>
              photo.id === id
                ? {
                    ...photo,
                    url: uploaded.url,
                    publicUrl: uploaded.url,
                    width: canvas.width,
                    height: canvas.height,
                    status: 'uploaded',
                  }
                : photo,
            ),
          );
        });
      }, 'image/webp', 0.9);
    };
    image.src = source;
  };

  const reviewKey = useRef('');
  const [photoCheck, setPhotoCheck] = useState<'idle' | 'looking' | 'no_key'>('idle');
  const [adviceTick, setAdviceTick] = useState(0);
  const publicPhotoKey = photos.flatMap((photo) => (photo.publicUrl ? [photo.publicUrl] : [])).join('\n');
  useEffect(() => {
    const id = savedRow?.id;
    if (!id || !signedIn || !supabaseConfigured || publicPhotoKey === '' || reviewKey.current === publicPhotoKey) {
      return;
    }
    reviewKey.current = publicPhotoKey;
    setPhotoCheck('looking');
    void (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setPhotoCheck('idle');
          return;
        }
        await saveListing(id, stateRef.current, photosRef.current, extrasRef.current).catch(() => undefined);
        let remaining = 1;
        let previous = Number.POSITIVE_INFINITY;
        let reason = '';
        for (let round = 0; remaining > 0 && remaining < previous && round < 25; round += 1) {
          previous = remaining;
          const response = await fetch('/api/photo-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ listingId: id }),
          });
          const body = (await response.json().catch(() => ({}))) as { remaining?: unknown; reason?: unknown };
          reason = typeof body.reason === 'string' ? body.reason : '';
          if (!response.ok || reason === 'no_key' || reason === 'no_answer') break;
          remaining = typeof body.remaining === 'number' ? body.remaining : 0;
          setAdviceTick((tick) => tick + 1);
        }
        setPhotoCheck(reason === 'no_key' ? 'no_key' : 'idle');
        setAdviceTick((tick) => tick + 1);
      } catch {
        setPhotoCheck('idle');
      }
    })();
  }, [publicPhotoKey, savedRow?.id, signedIn]);

  const addressKey = areaKey(state.city, state.street);
  const previewPlaces =
    surroundings && surroundings.key === addressKey ? surroundings.places : undefined;
  const previewSun = sunPoint ?? (previewPlaces ? coarseOrigin(previewPlaces) : undefined);

  /*
   * The title writes itself from the facts ("דירת 4 חדרים בחולון") until the
   * agent types their own (auto-title.ts). An empty title blocks publishing,
   * and a blank box asking for a headline is where people stop.
   */
  const lastAutoTitle = useRef('');
  useEffect(() => {
    const made = autoTitle(state.category, state.facts, state.city);
    const previous = lastAutoTitle.current;
    lastAutoTitle.current = made;
    if (!made) return;
    setState((current) =>
      (current.title.trim() === '' || current.title === previous) && current.title !== made
        ? { ...current, title: made }
        : current,
    );
  }, [state.category, state.facts, state.city]);

  const templateSuggestion = state.category
    ? suggestTemplate({
        category: state.category,
        facts: state.facts,
        street: state.street,
        namedRooms: new Set(photos.map((photo) => photo.room).filter(Boolean)).size,
        hasFloorPlan: plan !== undefined,
      })
    : undefined;

  // Arriving at "ready" on a new listing: the design is chosen for the agent,
  // once. They can change it there; a draft keeps the one it has.
  const autoTemplated = useRef(false);
  useEffect(() => {
    if (screen !== 'ready' || autoTemplated.current) return;
    autoTemplated.current = true;
    if (!freshListing.current || templateChosen.current || !templateSuggestion) return;
    const chosen = templateSuggestion.id;
    setState((current) => (current.template === chosen ? current : { ...current, template: chosen }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  // Which photographs the facts owe the buyer (photo-coverage.ts). Advice:
  // shown on the photo, room and publish steps, never read by publish.
  const coverage = useMemo(
    () => photoCoverage(state.category, state.facts, photos),
    [state.category, state.facts, photos],
  );
  const outstanding = useMemo(() => blockers(state), [state]);

  const position = SCREENS.indexOf(screen);
  const here = useMemo(() => screenBlockers(state, screen), [state, screen]);
  const photosBusy = photos.some(
    (photo) => photo.status === 'local' || photo.status === 'uploading',
  );

  useEffect(() => {
    void recordEditorEvent(SCREEN_STEP[screen], 'enter', listingId.current);
    window.scrollTo({ top: 0 });
  }, [screen]);

  const blockedSent = useRef<Screen | null>(null);
  useEffect(() => {
    if (here.length === 0) {
      blockedSent.current = null;
      return;
    }
    if (blockedSent.current === screen) return;
    blockedSent.current = screen;
    void recordEditorEvent(SCREEN_STEP[screen], 'blocked', listingId.current);
  }, [here.length, screen]);

  /**
   * "מודעה חדשה" passes ?fresh=1 so a previous session cannot skip the seller
   * to step 3 (photos). The dashboard's edit button passes ?id= and that row
   * wins over localStorage.
   */
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') {
      clearDraft();
      skipDraftRestore.current = true;
      params.delete('fresh');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/new/?${qs}` : '/new/');
    }
    if (params.get('id')) skipDraftRestore.current = true;
  }, []);

  /**
   * Opens an EXISTING listing when the dashboard sent us to one.
   *
   * The dashboard's edit button used to point at /new/ with no id, so it
   * started a fresh listing and the agent's work looked lost. It now passes
   * ?id={slug}, and this is the other half of that.
   *
   * The row wins over whatever is in localStorage. A saved draft belongs to
   * whichever listing was open last; restoring it over a different one would
   * paste one property's description onto another, which is worse than
   * losing it.
   */
  useEffect(() => {
    if (!supabaseConfigured || !signedIn) return;

    const wanted = new URLSearchParams(window.location.search).get('id');
    if (!wanted) return;

    skipDraftRestore.current = true;

    let live = true;

    void loadListing(wanted)
      .then((result) => {
        if (!live || !('row' in result)) return;
        const row = result.row;

        listingId.current = String(row.id ?? '');
        slug.current = String(row.slug ?? '');
        if (listingId.current && slug.current) {
          setSavedRow({ id: listingId.current, slug: slug.current });
        }

        const media = (row.media ?? {}) as {
          cover?: { id?: string; url?: string; alt?: string; room?: string };
          gallery?: { id?: string; url?: string; alt?: string; room?: string }[];
        };
        const savedVideo = cleanVideo((row.media as { video?: unknown }).video, listingId.current);
        if (savedVideo) setVideo(savedVideo);
        const stored = [media.cover, ...(media.gallery ?? [])].filter(
          (image): image is { id?: string; url?: string; alt?: string; room?: string } =>
            Boolean(image?.url),
        );

        setPhotos(
          stored.map((image, index) => ({
            id: image.id ?? `saved-${index}`,
            url: image.url as string,
            publicUrl: image.url as string,
            name: '',
            status: 'uploaded' as const,
            ...(typeof image.alt === 'string' && image.alt.trim() !== ''
              ? { alt: image.alt }
              : {}),
            ...(isPhotoRoom(image.room) ? { room: image.room } : {}),
          })),
        );

        const location = (row.location ?? {}) as { city?: string; street?: string };
        const origin = coarseOrigin(row.area_places);
        if (origin) setSunPoint(origin);
        const around = areaKey(location.city, location.street);
        setSurroundings(around && row.area_places ? { key: around, places: row.area_places } : undefined);
        if (isAccentId(row.accent)) accentSource.current = 'manual';

        let opened: EditorState | undefined;
        setState((current) => {
          const {
            ownerConsentDeclaredAt: _declared,
            ownerConsentName: _name,
            ...rest
          } = current;
          const next = {
            ...rest,
            category: row.category === 'vehicle' ? ('vehicle' as const) : ('property' as const),
            title: String(row.title ?? ''),
            price: Number(row.price ?? 0),
            ...(location.city ? { city: location.city } : {}),
            ...(location.street ? { street: location.street } : {}),
            ...(row.price_note ? { priceNote: String(row.price_note) } : {}),
            description: String(row.description ?? ''),
            facts: Array.isArray(row.facts)
              ? reconcileFacts(
                  row.category === 'vehicle' ? 'vehicle' : 'property',
                  row.facts,
                )
              : current.facts,
            photoCount: stored.length,
            indexable: row.indexable === true,
            prePortal: row.pre_portal === true,
            ...(row.owner_consent_declared_at
              ? { ownerConsentDeclaredAt: String(row.owner_consent_declared_at) }
              : {}),
            ...(typeof row.owner_consent_name === 'string' && row.owner_consent_name.trim() !== ''
              ? { ownerConsentName: String(row.owner_consent_name) }
              : {}),
            ...(row.template ? { template: row.template as EditorState['template'] } : {}),
            ...(isAccentId(row.accent) ? { accent: row.accent } : {}),
            ...(row.audience === 'resident'
              ? { audience: 'resident' as const }
              : row.audience === 'investor'
                ? { audience: 'investor' as const }
                : row.audience === 'both'
                  ? { audience: 'both' as const }
                  : {}),
            ...(Array.isArray(row.disclosures) ? { disclosures: row.disclosures as string[] } : {}),
            ...(typeof (row.media as { tourUrl?: unknown } | null)?.tourUrl === 'string' &&
            String((row.media as { tourUrl: string }).tourUrl).startsWith('https://')
              ? { tourUrl: String((row.media as { tourUrl: string }).tourUrl) }
              : {}),
          };
          opened = next;
          return next;
        });
        // "תצוגה מקדימה" on a draft opens that step. Everything else opens
        // the first gap (nextStep): a finished listing does not make the
        // agent walk "מה מוכרים?" again, and a missing photo still cannot
        // be skipped.
        const opening = new URLSearchParams(window.location.search).get('step');
        freshListing.current = false;
        if (opening === 'preview') {
          followGap.current = false;
          setScreen('ready');
        } else if (opened && followGap.current) {
          setScreen(nextScreen(opened));
        }
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [signedIn]);

  /**
   * Restores a saved draft onto the first step that still needs work.
   *
   * Entitlement is untouched: `Draft` has no such field. See useDraft.
   * photoCount is not in the draft either — the photos come back from the
   * row below, and the landing is recomputed once they have.
   */
  useDraft(
    state,
    (draft) => {
      if (skipDraftRestore.current) return;
      if (draft.accent) accentSource.current = 'manual';
      const merged = {
        ...stateRef.current,
        ...draft,
        entitlement: stateRef.current.entitlement,
      };
      setState((current) => ({ ...current, ...draft, entitlement: current.entitlement }));
      freshListing.current = false;
      if (followGap.current) setScreen(nextScreen(merged));
      if (!draft.slug || !supabaseConfigured) return;
      void loadListing(draft.slug)
        .then((result) => {
          if (!('row' in result)) return;
          const row = result.row;
          listingId.current = String(row.id ?? '');
          slug.current = String(row.slug ?? '');
          if (listingId.current && slug.current) {
            setSavedRow({ id: listingId.current, slug: slug.current });
          }
          const media = (row.media ?? {}) as {
            cover?: { id?: string; url?: string; alt?: string; room?: string };
            gallery?: { id?: string; url?: string; alt?: string; room?: string }[];
          };
          const savedVideo = cleanVideo((row.media as { video?: unknown }).video, listingId.current);
          if (savedVideo) setVideo(savedVideo);
          const stored = [media.cover, ...(media.gallery ?? [])].filter(
            (image): image is { id?: string; url?: string; alt?: string; room?: string } =>
              Boolean(image?.url),
          );
          if (stored.length === 0) return;
          setPhotos(
            stored.map((image, index) => ({
              id: image.id ?? `saved-${index}`,
              url: image.url as string,
              publicUrl: image.url as string,
              name: '',
              status: 'uploaded' as const,
              ...(typeof image.alt === 'string' && image.alt.trim() !== ''
                ? { alt: image.alt }
                : {}),
              ...(isPhotoRoom(image.room) ? { room: image.room } : {}),
            })),
          );
          setState((current) => ({ ...current, photoCount: stored.length }));
          if (followGap.current) {
            setScreen(nextScreen({ ...stateRef.current, photoCount: stored.length }));
          }
          const saved = row.media as {
            floorPlan?: { url?: string; width?: number; height?: number; rooms?: unknown };
            spin?: { id?: string; url?: string; width?: number; height?: number }[];
          };
          if (saved.floorPlan?.url) {
            setPlan({
              url: saved.floorPlan.url,
              width: Number(saved.floorPlan.width ?? 4),
              height: Number(saved.floorPlan.height ?? 3),
              rooms: cleanPlanRooms(saved.floorPlan.rooms),
            });
          }
          if (Array.isArray(saved.spin)) {
            setSpin(
              saved.spin
                .filter((frame): frame is { id?: string; url: string; width?: number; height?: number } => Boolean(frame?.url))
                .map((frame, index) => ({
                  id: frame.id ?? `spin-${index}`,
                  url: frame.url,
                  width: Number(frame.width ?? 1),
                  height: Number(frame.height ?? 1),
                })),
            );
          }
        })
        .catch(() => undefined);
    },
    { listingId: savedRow?.id ?? listingId.current, slug: savedRow?.slug ?? slug.current },
  );

  /**
   * Writes the editor's state back to the row.
   *
   * At every step boundary rather than on a timer: a step boundary is the
   * moment a seller has finished saying something, and also the moment they
   * might close the tab. An agent between viewings does not come back to a
   * form, they come back to a link.
   *
   * Failure is swallowed on purpose. The draft is still in localStorage, the
   * seller keeps working, and the next boundary tries again — an editor that
   * stops because a network call failed is worse than one that saves late.
   */
  const persist = () => {
    const id = listingId.current;
    if (!id || !supabaseConfigured || !signedIn) return;
    void saveListing(id, stateRef.current, photos, extrasRef.current)
      .then((result) => {
        setFailure('error' in result ? t('editor.publish.saveFailed') : undefined);
        if (!('error' in result)) lookUpArea(id);
      })
      .catch(() => setFailure(t('editor.publish.saveFailed')));
  };

  /**
   * The surroundings, looked up as soon as a saved row has a city and street.
   *
   * Once per address: the key is remembered, so walking back and forth
   * through the steps costs nothing, and a changed street asks again. The
   * server reads the address from the row, which is why this runs only after
   * a save. Anything short of a settled answer — a busy Overpass, a dropped
   * request, a lookup still running in the background — is asked again after
   * 5, 15 and 30 seconds (it used to be once, and only for "pending").
   */
  const areaAskedFor = useRef<string | undefined>(undefined);
  const lookUpArea = (id: string, attempt = 0) => {
    const current = stateRef.current;
    if (current.category !== 'property') return;
    const key = areaKey(current.city, current.street);
    if (!key) return;
    if (attempt === 0) {
      if (areaAskedFor.current === key) return;
      areaAskedFor.current = key;
      setSunPoint(undefined);
    }
    if (areaAskedFor.current !== key) return;
    setArea({ key, status: 'working' });
    void requestArea(id).then((answer) => {
      if (areaAskedFor.current !== key) return;
      if (answer?.sun) setSunPoint(answer.sun);
      if (answer?.areaPlaces) setSurroundings({ key, places: answer.areaPlaces });
      const status = answer?.status ?? 'failed';
      if (!areaSettled(status) && attempt < AREA_RETRY_MS.length) {
        setArea({ key, status: 'working' });
        window.setTimeout(() => lookUpArea(id, attempt + 1), AREA_RETRY_MS[attempt]);
        return;
      }
      const count = answer?.areaPlaces ? allPlaces(answer.areaPlaces as AreaPlaces).length : undefined;
      setArea({ key, status: areaSettled(status) ? status : 'failed', ...(count ? { count } : {}) });
    });
  };

  /*
   * Ask as soon as the listing exists and the address is filled in — not only
   * at the next step change. The address step comes before the photos, and
   * the row is created with the first photo, so this is the earliest moment
   * the server can read an address. Typing is debounced.
   */
  useEffect(() => {
    if (!savedRow?.id || state.category !== 'property') return;
    const key = areaKey(state.city, state.street);
    if (!key || areaAskedFor.current === key) return;
    const timer = window.setTimeout(() => persist(), 800);
    return () => window.clearTimeout(timer);
    // persist reads the latest state from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRow?.id, state.city, state.street, state.category]);

  // A loaded neighbourhood with no street midpoint still needs a sun. An
  // address that has not been saved yet waits for the save, which asks too.
  useEffect(() => {
    const id = savedRow?.id;
    const key = areaKey(state.city, state.street);
    if (!signedIn || !id || sunPoint || !key) return;
    if (state.category === 'vehicle') return;
    if (!surroundings || surroundings.key !== key) return;
    if (coarseOrigin(surroundings.places)) return;
    lookUpArea(id);
    // lookUpArea reads the address from a ref and asks once per address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, sunPoint, state.city, state.street, state.category, savedRow, surroundings]);

  /**
   * Publishes, and hands back the link.
   *
   * ======================== HUMAN REVIEW ========================
   * CLAUDE.md §8. The gate is `canPublish`, which is false whenever ANY
   * blocker stands — including the entitlement one, which fails closed on
   * anything that is not 'paid' or 'free'. This function does not read or
   * decide entitlement; it refuses to act when the shared rule says no.
   * ==============================================================
   */
  const publish = () => {
    const id = listingId.current;
    if (!id || !canPublish(state) || publishing) return;

    /*
     * A photo still in flight is not a publishable listing.
     *
     * `photoCount` says how many the seller PICKED; `publicUrl` says which of
     * them a page can show. Publishing between those two facts is how a live
     * listing ended up with no photographs and a page that would not render.
     */
    if (photosBusy) {
      setFailure(t('editor.photosUploading'));
      return;
    }
    if (!photos.some((photo) => photo.publicUrl)) {
      setFailure(t('editor.publish.noPhotos'));
      return;
    }

    setPublishing(true);
    setFailure(undefined);

    void (async () => {
      // Save first. Publishing a row that is one step behind what the agent
      // sees is how a page ships without the description they just wrote.
      const saved = await saveListing(id, state, photos, extrasRef.current).catch(
        () => ({ error: 'failed' }) as const,
      );
      if ('error' in saved) {
        setPublishing(false);
        setFailure(t('editor.publish.saveFailed'));
        return;
      }

      /*
       * The neighbourhood, if the address step's lookup has not landed yet,
       * so the first buyer to open the link sees the map and the walking
       * times. Capped: the page renders per request and reads the row, so a
       * lookup that finishes after publish still reaches every later visit,
       * and the agent's link is worth more than a few seconds of waiting.
       */
      const key = areaKey(state.city, state.street);
      if (state.category === 'property' && key) {
        // A lookup that gave up earlier gets a fresh round now.
        if (areaRef.current?.key === key && areaRef.current.status === 'failed') areaAskedFor.current = undefined;
        lookUpArea(id);
        if (!areaSettled(areaRef.current?.key === key ? areaRef.current.status : undefined)) {
          setPublishNote(t('editor.publish.waitingArea'));
          const until = Date.now() + AREA_AT_PUBLISH_MS;
          while (Date.now() < until) {
            const now = areaRef.current;
            if (now?.key === key && areaSettled(now.status)) break;
            await new Promise((resolve) => window.setTimeout(resolve, 300));
          }
          setPublishNote(undefined);
        }
      }

      const result = await publishListing(id, state, photos, extrasRef.current).catch(
        () => ({ error: 'failed' }) as const,
      );

      if ('ok' in result) {
        void recordEditorEvent('publish', 'publish_ok', id);

        /*
         * The WhatsApp card and the story image, drawn on this phone.
         *
         * BEFORE the link is shown, because WhatsApp caches a preview hard
         * (CLAUDE.md §6): a link pasted before its card exists keeps the
         * plain photograph in that chat for good. Capped, because a slow
         * upload must not hold the agent's link hostage; a card that lands
         * later still reaches every chat the link is pasted into after it.
         */
        await Promise.race([
          import('../../lib/share-images').then(({ makeShareImages }) => makeShareImages(id)).catch(() => 'failed'),
          new Promise((resolve) => window.setTimeout(resolve, SHARE_IMAGES_AT_PUBLISH_MS)),
        ]);

        setPublishing(false);
        const publishedSlug = result.slug || slug.current;
        if (publishedSlug) {
          slug.current = publishedSlug;
          setPublishedUrl(`${window.location.origin}/a/${publishedSlug}/`);
        }
        clearDraft();
      } else {
        setPublishing(false);
        void recordEditorEvent('publish', 'publish_fail', id);
        setFailure(
          result.error === 'no_photos'
            ? t('editor.publish.noPhotos')
            : t('editor.publish.failed'),
        );
      }
    })();
  };

  /** Which way the last screen change went, so the next one slides in from there. */
  const [stepMotion, setStepMotion] = useState<'forward' | 'back'>('forward');

  /**
   * Next and Back are never disabled (11 Oct 2026). A greyed-out button with
   * no reason is the moment an agent gives up; what is still missing is
   * listed in words on the publish screen, each with a way to go and fix it.
   * Photos still uploading keep uploading on the next screen.
   */
  /** "More details" opens itself only when "fix" sent the agent to it. */
  const [openMore, setOpenMore] = useState(false);
  const goTo = (target: Screen) => {
    if (target === screen) return;
    followGap.current = false;
    setStepMotion(SCREENS.indexOf(target) < position ? 'back' : 'forward');
    persist();
    setScreen(target);
  };
  const go = (delta: number) => {
    const target = SCREENS[position + delta];
    if (target) goTo(target);
  };

  /**
   * Choosing a category also builds its fact list.
   *
   * CHANGING it rebuilds from the new schema, discarding the old answers.
   * They cannot be carried over — the two schemas share no keys, and a
   * silent partial merge would leave a vehicle listing holding a room count.
   * Re-choosing the SAME category is a no-op, so a stray second tap on the
   * button already selected does not wipe the form.
   */
  const choose = (category: NonNullable<EditorState['category']>) => {
    setState((current) =>
      current.category === category
        ? current
        : { ...current, category, facts: blankFacts(category) },
    );
  };

  const isProperty = state.category === 'property';
  const essential = state.category ? ESSENTIAL_FACTS[state.category] : [];
  const setFacts = (facts: EditorState['facts']) => setState((current) => ({ ...current, facts }));
  const setAudience = (audience: EditorState['audience']) =>
    setState((current) => {
      if (audience === undefined) {
        const { audience: _omitted, ...rest } = current;
        return rest;
      }
      return { ...current, audience };
    });

  return (
    <div className="editor-shell">
    <div className="editor">
      <header className="flow-head">
        {/*
          Four dots and the screen's name. The count is said in words for a
          screen reader; the dots are the same fact drawn, so they are hidden
          from it. Dot 1 is the inline START, which in Hebrew is the right.
        */}
        <p className="flow-count">
          <Message path="editor.stepOf" values={{ current: position + 1, total: SCREENS.length }} />
        </p>
        <ol className="flow-dots" aria-hidden="true">
          {SCREENS.map((id, index) => (
            <li key={id} className={index < position ? 'is-done' : index === position ? 'is-here' : undefined}>
              <span>{t(`editor.flow.dot.${id}`)}</span>
            </li>
          ))}
        </ol>
        <h1 className="flow-title">{t(`editor.flow.${screen}.title`)}</h1>
        <p className="flow-lead">{t(`editor.flow.${screen}.lead`)}</p>
      </header>

      {/* Keyed by screen so each arrival is a fresh element and its entrance
          plays; the direction follows the reading order (editor.css). */}
      <section key={screen} data-motion={stepMotion} className={`step screen screen-${screen}`}>
        {screen === 'photos' ? (
          <>
            <CategoryStep chosen={state.category} onChoose={choose} />
            {state.category ? (
              <>
                <PhotosStep
                  photos={photos}
                  onChange={changePhotos}
                  signedIn={signedIn}
                  category={state.category}
                />
                <PhonePortal signedIn={signedIn} ensureListing={ensureListing} onPhotos={takeFromPhone} />
                <PhotoAdvice
                  listingId={savedRow?.id}
                  photos={photos}
                  status={photoCheck}
                  refreshKey={adviceTick}
                  onLabel={labelRoom}
                  onCover={makeCover}
                  onRotate={rotatePhoto}
                />
                <PhotoChecklist coverage={coverage} count={photos.length} />
                {photosBusy ? <p className="hint">{t('editor.flow.uploadingNote')}</p> : null}
              </>
            ) : null}
          </>
        ) : null}

        {screen === 'details' && state.category ? (
          <>
            {state.category === 'vehicle' ? (
              <PlateStep
                plate={plate}
                onPlate={setPlate}
                declared={declaredOwner}
                onDeclare={setDeclaredOwner}
                facts={state.facts}
                onFacts={setFacts}
              />
            ) : null}

            <DetailsStep
              category={state.category}
              title={state.title}
              price={state.price}
              city={state.city ?? ''}
              street={state.street ?? ''}
              priceNote={state.priceNote ?? ''}
              fields={isProperty ? ['city', 'street', 'price'] : ['price', 'city']}
              cityError={here.some((blocker) => blocker.code === 'cityMissing')}
              areaStatus={area && area.key === addressKey ? area.status : undefined}
              areaCount={area && area.key === addressKey ? area.count : undefined}
              onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
            />

            <FactsStep
              category={state.category}
              facts={state.facts}
              onChange={setFacts}
              audience={state.audience}
              onAudience={setAudience}
              only={essential}
              extras={false}
            />

            {isProperty ? (
              <ConsentStep
                declaredAt={state.ownerConsentDeclaredAt}
                ownerName={state.ownerConsentName ?? ''}
                onDeclare={(ownerConsentDeclaredAt) =>
                  setState((current) => {
                    if (ownerConsentDeclaredAt === undefined) {
                      const { ownerConsentDeclaredAt: _omitted, ...rest } = current;
                      return rest;
                    }
                    return { ...current, ownerConsentDeclaredAt };
                  })
                }
                onOwnerName={(name) =>
                  setState((current) => {
                    const { ownerConsentName: _omitted, ...rest } = current;
                    return name.trim() === '' ? rest : { ...rest, ownerConsentName: name };
                  })
                }
              />
            ) : null}

            {/* Everything a page does not need. Closed by default, and
                nothing in here blocks publishing except the title, which is
                written automatically and only shows up as missing if the
                agent clears it. */}
            <details className="more" open={openMore || undefined}>
              <summary className="more-summary">
                <span className="more-title">{t('editor.flow.more')}</span>
                <span className="more-hint">{t(isProperty ? 'editor.flow.moreHintProperty' : 'editor.flow.moreHintVehicle')}</span>
              </summary>
              <div className="more-body">
                <DetailsStep
                  category={state.category}
                  title={state.title}
                  price={state.price}
                  city={state.city ?? ''}
                  street={state.street ?? ''}
                  priceNote={state.priceNote ?? ''}
                  fields={['title', 'priceNote']}
                  titleError={here.some((blocker) => blocker.code === 'titleMissing')}
                  onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
                />
                <FactsStep
                  category={state.category}
                  facts={state.facts}
                  onChange={setFacts}
                  audience={state.audience}
                  onAudience={setAudience}
                  except={essential}
                />
                <DisclosuresStep
                  items={state.disclosures ?? []}
                  category={state.category}
                  onChange={(disclosures) => setState((current) => ({ ...current, disclosures }))}
                />
                {isProperty ? (
                  <>
                    <RoomsStep photos={photos} onChange={changePhotos} />
                    {signedIn ? (
                      <PlanEditor plan={plan} onPlan={setPlan} onUpload={uploadPlan} uploading={extraUploading} />
                    ) : null}
                  </>
                ) : signedIn ? (
                  <SpinEditor frames={spin} onFrames={setSpin} onUpload={uploadSpin} uploading={extraUploading} />
                ) : null}
              </div>
            </details>
          </>
        ) : null}

        {screen === 'ready' ? (
          <>
            <div className="ready-preview">
              <LivePreview
                state={state}
                photos={photos}
                profile={profile}
                extras={extras}
                sun={previewSun}
                areaPlaces={previewPlaces}
                designs={pickerTemplates(state.category ?? 'property', state.template).filter((id) =>
                  CATALOGUE.includes(id),
                )}
                onDesign={(template) => {
                  templateChosen.current = true;
                  setState((current) => ({ ...current, template }));
                }}
              />
            </div>
            <FilmFile photos={photos} listingId={savedRow?.id} onVideo={acceptVideo} />

            <h2 className="ready-head">{t('editor.flow.textTitle')}</h2>
            <DescriptionStep
              text={state.description}
              generated={state.generatedDescription}
              facts={state.facts}
              onChange={(description) => setState((current) => ({ ...current, description }))}
              onSuggest={canSuggest ? () => suggest() : undefined}
              suggesting={suggesting}
              waitingForArea={waitingForArea && state.description.trim() === ''}
              suggestFailed={
                suggestFailed === false
                  ? undefined
                  : suggestFailed === 'no_facts'
                    ? t('editor.description.failedNoFacts')
                    : suggestFailed === 'no_session' || suggestFailed === 'unauthenticated'
                      ? t('editor.description.failedSignIn')
                      : t('editor.description.suggestFailed')
              }
              source={suggestSource}
              tone={tone}
              onTone={(next) => {
                if (next === tone) return;
                setTone(next);
                // The chip has to change the box on this click. The server
                // then replaces it with the same voice plus the neighbourhood,
                // and a model that keeps the old opening is refused.
                const drafted = draftInVoice(state.category, state.facts, state.city, state.description, next);
                if (drafted.trim() && drafted.trim() !== state.description.trim()) {
                  setState((current) => ({
                    ...current,
                    description: drafted,
                    generatedDescription: drafted,
                  }));
                }
                suggest(next);
              }}
            />

            <h2 className="ready-head">{t('editor.flow.designTitle')}</h2>
            <p className="ready-design">
              <Message
                path="editor.flow.designNow"
                values={{ name: t(`editor.templates.${state.template ?? 'aurora'}`) }}
              />
            </p>
            <details className="more">
              <summary className="more-summary">
                <span className="more-title">{t('editor.flow.changeDesign')}</span>
              </summary>
              <div className="more-body step-templates">
                <TemplateStep
                  category={state.category}
                  chosen={state.template}
                  onChoose={(template) => {
                    templateChosen.current = true;
                    setState((current) => ({ ...current, template }));
                  }}
                  accent={state.accent ?? profile.accent ?? undefined}
                  onAccent={(accent) => {
                    accentSource.current = 'manual';
                    setState((current) => ({ ...current, accent }));
                  }}
                  accentFromCover={accentSource.current === 'cover'}
                  coverTone={coverTone}
                  missingAspect={
                    state.category === 'property' &&
                    !state.facts.some(
                      (fact) =>
                        fact.key === 'aspect' &&
                        fact.present !== false &&
                        typeof fact.value === 'string' &&
                        fact.value.trim() !== '',
                    )
                  }
                  photos={photos
                    .map((photo) => photo.publicUrl ?? photo.url)
                    .filter((url): url is string => url.trim() !== '')}
                  suggestion={templateSuggestion}
                />
              </div>
            </details>
          </>
        ) : null}

        {screen === 'publish' ? (
          <>
            {/* What still stands between the agent and their link, in
                words, each with the way back to fix it. The button below is
                the same gate as always (canPublish; CLAUDE.md §8). */}
            {outstanding.length > 0 && !publishedUrl ? (
              <section className="missing" role="status">
                <h2 className="missing-title">{t('editor.flow.missingTitle')}</h2>
                <ul>
                  {outstanding
                    // The payment line is PublishStep's own, beside the button.
                    .filter((blocker) => blocker.code !== 'paymentRequired' && blocker.code !== 'paymentUnverified')
                    .map((blocker) => (
                    <li key={`${blocker.code}:${blocker.factLabel ?? ''}`}>
                      <span>
                        <Message
                          path={`editor.blockers.${blocker.code}`}
                          values={{ max: MAX_IMAGES, label: blocker.factLabel ?? '' }}
                        />
                      </span>
                      {blocker.code === 'sellerMissing' ? (
                        <a className="missing-fix" href="/me/">
                          {t('editor.flow.completeProfile')}
                        </a>
                      ) : screenOf(blocker.step) !== 'publish' ? (
                        <button
                          type="button"
                          className="missing-fix"
                          onClick={() => {
                            // The title lives under "more details": open it.
                            if (blocker.code === 'titleMissing') setOpenMore(true);
                            goTo(screenOf(blocker.step));
                          }}
                        >
                          {t('editor.flow.fix')}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <PublishStep
              state={state}
              blockers={outstanding}
              publishedUrl={publishedUrl}
              publishedSlug={slug.current ?? undefined}
              publishing={publishing}
              publishNote={publishNote}
              areaStatus={state.category === 'property' && area && area.key === addressKey ? area.status : undefined}
              areaCount={area && area.key === addressKey ? area.count : undefined}
              photoCheck={<PhotoChecklist coverage={coverage} count={photos.length} variant="line" />}
              shelf={false}
              failure={failure}
              onPublish={publish}
              onCopy={(url) =>
                void navigator.clipboard
                  .writeText(url)
                  // Copying the fresh link is the first share (time to link, 0035).
                  .then(() => (slug.current ? recordListingEvent(slug.current, 'share', null) : undefined))
                  .catch(() => undefined)
              }
              onIndexable={(indexable) => setState((current) => ({ ...current, indexable }))}
              onPrePortal={(prePortal) => setState((current) => ({ ...current, prePortal }))}
            />
          </>
        ) : null}
      </section>

      {/* A save that failed is said out loud on whatever screen the agent is
          on. The publish screen gets it inside PublishStep, beside the
          button that did nothing. */}
      {failure && screen !== 'publish' ? (
        <p className="publish-failure" role="alert">
          {failure}
        </p>
      ) : null}

      {/*
        Words, no chevrons. Back and forward ARE direction icons and so they
        would have to flip in Hebrew (§4.3) — but ‹ and › are bidi-MIRRORED
        characters: the browser already flips them inside an RTL paragraph, so
        writing the flipped one flips it twice and both arrows end up pointing
        the same way.
      */}
      {publishedUrl ? null : (
        <footer className="nav">
          {position > 0 ? (
            <button type="button" className="nav-back" onClick={() => go(-1)}>
              {t('common.back')}
            </button>
          ) : null}
          {position < SCREENS.length - 1 ? (
            <button type="button" className="nav-next" onClick={() => go(1)}>
              {t(`editor.flow.next.${screen}`)}
            </button>
          ) : null}
        </footer>
      )}
    </div>

    {screen === 'photos' || screen === 'details' ? (
      <aside className={peekOpen ? 'facsimile is-open' : 'facsimile'} aria-label={t('editor.facsimile')}>
        {peekOpen ? (
          <button type="button" className="peek-close" onClick={() => setPeekOpen(false)}>
            {t('editor.peekClose')}
          </button>
        ) : null}
        <LivePreview
          state={state}
          photos={photos}
          profile={profile}
          extras={extras}
          sun={previewSun}
          areaPlaces={previewPlaces}
        />
      </aside>
    ) : null}
    </div>
  );
}

interface CategoryProps {
  chosen: EditorState['category'];
  onChoose: (category: NonNullable<EditorState['category']>) => void;
}

/**
 * Apartment or car: two big buttons with a drawing each, at the top of the
 * first screen. The list comes from the schema registry, so a third
 * category appears here by existing.
 */
function CategoryStep({ chosen, onChoose }: CategoryProps) {
  return (
    <div className="kind">
      <p className="kind-question">{t('editor.flow.kindQuestion')}</p>
      <ul className="kind-choices">
        {LISTING_CATEGORIES.map((category) => (
          <li key={category}>
            <button
              type="button"
              className={category === chosen ? 'kind-choice chosen' : 'kind-choice'}
              aria-pressed={category === chosen}
              onClick={() => onChoose(category)}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true" className="kind-icon">
                {category === 'vehicle' ? (
                  <path d="M8 30l4-10c1-2 3-3 5-3h14c2 0 4 1 5 3l4 10v7h-5v-3H13v3H8v-7zm7-1a3 3 0 100 .1zm18 0a3 3 0 100 .1zM14 26h20l-3-7H17l-3 7z" />
                ) : (
                  <path d="M24 8L6 22h5v18h10V30h6v10h10V22h5L24 8z" />
                )}
              </svg>
              <span>{schemaFor(category).label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
