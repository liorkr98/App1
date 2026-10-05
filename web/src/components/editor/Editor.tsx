import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  blockers,
  canAdvance,
  canPublish,
  MAX_IMAGES,
  nextStep,
  reachable,
  stepsFor,
  type EditorState,
  type Step,
} from '@/features/listings/editor';
import { blankFacts, reconcileFacts } from '@/features/listings/fact-entry';
import { isPhotoRoom } from '@/features/listings/photo-rooms';
import { LISTING_CATEGORIES, schemaFor } from '@/features/listings/schemas';
import { suggestTemplate } from '@/features/templates/suggest';
import { cleanPlanRooms } from '@/features/listings/rich-media';
import type { MediaExtras } from '../../lib/listing-row';
import type { CopyTone } from '@/features/listings/listing-copy';

import { isProfileComplete } from '@/features/agents/profile';
import { DEFAULT_ACCENT, isAccentId } from '@/features/agents/accents';

import { t } from '../../lib/i18n';
import { loadEntitlement } from '../../lib/entitlement';
import { createDraft, uploadOriginal } from '../../lib/listing-draft';
import { coarseOrigin } from '@/features/sun/anchor';
import { areaKey, requestArea } from '../../lib/area-request';
import { enqueuePublishJobs } from '../../lib/listing-jobs';
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
  template: 'agency',

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
 * Long enough for a cached answer or a quick Overpass reply, short enough
 * that publishing never feels stuck on it.
 */
const AREA_AT_PUBLISH_MS = 6_000;

export default function Editor() {
  const [state, setState] = useState<EditorState>(START);
  const [step, setStep] = useState<Step>('category');
  /**
   * True until the agent picks a step themselves. Opening a saved listing
   * lands on the first gap (`nextStep`); once they tap Next, Back or a
   * step, that choice sticks — a photo finishing its upload must not
   * yank them to a later screen.
   */
  const followGap = useRef(true);
  const railList = useRef<HTMLOListElement>(null);

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
  const [extraUploading, setExtraUploading] = useState(false);
  const extras = useMemo<MediaExtras>(() => ({ plan, spin }), [plan, spin]);
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
  const [suggestFailed, setSuggestFailed] = useState(false);
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
  const suggestGen = useRef(0);

  const suggest = (retriesLeft = 1, voice?: CopyTone) => {
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

        const response = await fetch('/api/description', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ listingId: id, previous, tone: voiceNow }),
        });
        if (!response.ok) throw new Error(String(response.status));

        const streamed = (response.headers.get('content-type') ?? '').includes(
          'text/event-stream',
        );

        let text = '';
        let areaPending = false;
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
                areaPending = body.areaPending === true;
                source = sourceOf(body);
              }
            }
          }
        } else {
          const body = (await response.json()) as SuggestAnswer;
          text = typeof body.text === 'string' ? body.text.trim() : '';
          areaPending = body.areaPending === true;
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

        /*
         * The paragraph about the address is the one worth waiting for.
         *
         * `areaPending` means the server had a street to look up and
         * OpenStreetMap did not answer in time — a busy minute on a public
         * service, which a second attempt usually gets past. The seller
         * already has a description in the box, so this replaces it quietly
         * rather than making them wait for it.
         *
         * ONE retry. Anything more would queue requests against a service run
         * on donations for a paragraph the seller can also just write.
         */
        if (areaPending && retriesLeft > 0) {
          setSuggesting(false);
          window.setTimeout(() => suggest(retriesLeft - 1, voiceNow), 4000);
          return;
        }
      } catch {
        if (ticket === suggestGen.current) setSuggestFailed(true);
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
  useEffect(() => {
    if (step !== 'description' || autoSuggested.current) return;
    if (!canSuggest || state.description.trim() !== '') return;
    autoSuggested.current = true;
    suggest();
    // `suggest` is stable enough for this: it reads the listing id from a ref
    // and guards on `suggesting`, so it cannot fire twice for one arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canSuggest, state.description]);

  const changePhotos = (next: EditorPhoto[]) => {
    setPhotos(next);
    setState((current) => ({ ...current, photoCount: next.length }));
    void uploadPending(next, state.category);
  };

  const steps = useMemo(() => stepsFor(state.category), [state.category]);
  const outstanding = useMemo(() => blockers(state), [state]);

  const position = steps.indexOf(step);
  const here = outstanding.filter((blocker) => blocker.step === step);
  const photosBusy = photos.some(
    (photo) => photo.status === 'local' || photo.status === 'uploading',
  );

  useEffect(() => {
    void recordEditorEvent(step, 'enter', listingId.current);
    railList.current?.querySelector('.is-here')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [step]);

  const blockedSent = useRef<Step | null>(null);
  useEffect(() => {
    if (here.length === 0) {
      blockedSent.current = null;
      return;
    }
    if (blockedSent.current === step) return;
    blockedSent.current = step;
    void recordEditorEvent(step, 'blocked', listingId.current);
  }, [here.length, step]);

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
        if (opening === 'preview') {
          followGap.current = false;
          setStep('preview');
        } else if (opened && followGap.current) {
          setStep(nextStep(opened));
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
      if (followGap.current) setStep(nextStep(merged));
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
            setStep(nextStep({ ...stateRef.current, photoCount: stored.length }));
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
   * a save. A busy OpenStreetMap gets one retry a few seconds later.
   */
  const areaAskedFor = useRef<string | undefined>(undefined);
  const lookUpArea = (id: string, retry = true) => {
    const current = stateRef.current;
    if (current.category !== 'property') return;
    const key = areaKey(current.city, current.street);
    if (!key || areaAskedFor.current === key) return;
    areaAskedFor.current = key;
    setSunPoint(undefined);
    void requestArea(id).then((answer) => {
      if (areaAskedFor.current === key && answer?.sun) setSunPoint(answer.sun);
      if (answer?.pending && retry) {
        areaAskedFor.current = undefined;
        window.setTimeout(() => lookUpArea(id, false), 5000);
      }
    });
  };

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
      if (state.category === 'property' && areaKey(state.city, state.street)) {
        await Promise.race([
          requestArea(id),
          new Promise((resolve) => window.setTimeout(resolve, AREA_AT_PUBLISH_MS)),
        ]);
      }

      const result = await publishListing(id, state, photos, extrasRef.current).catch(
        () => ({ error: 'failed' }) as const,
      );
      setPublishing(false);

      if ('ok' in result) {
        void recordEditorEvent('publish', 'publish_ok', id);
        const publishedSlug = result.slug || slug.current;
        if (publishedSlug) {
          slug.current = publishedSlug;
          setPublishedUrl(`${window.location.origin}/a/${publishedSlug}/`);
        }
        const originals = photos
          .map((photo) => photo.path)
          .filter((path): path is string => Boolean(path));
        void enqueuePublishJobs({
          listingId: id,
          originalPaths: originals,
          ...(photos[0]?.path ? { coverPath: photos[0].path } : {}),
          price: state.price,
          ...(slug.current ? { slug: slug.current } : {}),
          content: JSON.stringify([state.title, state.template, state.accent, state.facts, state.city, state.street]),
        });
        clearDraft();
      } else {
        void recordEditorEvent('publish', 'publish_fail', id);
        setFailure(
          result.error === 'no_photos'
            ? t('editor.publish.noPhotos')
            : t('editor.publish.failed'),
        );
      }
    })();
  };

  /** Which way the last step change went, so the next step slides in from there. */
  const [stepMotion, setStepMotion] = useState<'forward' | 'back'>('forward');

  const go = (delta: number) => {
    if (delta > 0 && step === 'photos' && photosBusy) return;
    followGap.current = false;
    setStepMotion(delta < 0 ? 'back' : 'forward');
    persist();
    const target = steps[position + delta];
    if (target) setStep(target);
  };

  const jump = (target: Step) => {
    if (target === step || !reachable(state, target)) return;
    if (step === 'photos' && photosBusy && steps.indexOf(target) > position) return;
    followGap.current = false;
    setStepMotion(steps.indexOf(target) < position ? 'back' : 'forward');
    persist();
    setStep(target);
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

  return (
    <div className="editor-shell">
    <div className="editor">
      <header className="rail">
        <p className="rail-count">
          <Message
            path="editor.stepOf"
            values={{ current: position + 1, total: steps.length }}
          />
        </p>
        <h1 className="rail-title">{t(`editor.steps.${step}`)}</h1>

        {/*
          The bar is decoration for a number that is already stated above it,
          so it is hidden from assistive technology rather than given a role
          that would read the same fact twice.

          It fills from the INLINE START, which in Hebrew is the right edge.
          A physical `left` here would fill it backwards, and it would look
          fine in every English screenshot.
        */}
        <nav className="step-rail" aria-label={t('editor.stepRail')}>
          <ol ref={railList}>
            {steps.map((id, index) => {
              const open = id === step || reachable(state, id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={id === step ? 'step-pip is-here' : 'step-pip'}
                    aria-current={id === step ? 'step' : undefined}
                    aria-label={t(`editor.steps.${id}`)}
                    disabled={!open || (step === 'photos' && photosBusy && index > position)}
                    onClick={() => jump(id)}
                  >
                    <bdi>{index + 1}</bdi>
                    <span>{t(`editor.stepShort.${id}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="rail-bar" aria-hidden="true">
          {/*
            A scale factor, not a width. Animating inline-size relaid the bar
            out on every frame; a transform is composited. The custom property
            needs the cast because React's CSSProperties has no index
            signature for one.
          */}
          <div
            className="rail-fill"
            style={{ '--progress': (position + 1) / steps.length } as CSSProperties}
          />
        </div>
      </header>

      {/* Keyed by step so each arrival is a fresh element and its entrance
          plays; the direction follows the reading order (editor.css). */}
      <section
        key={step}
        data-motion={stepMotion}
        className={step === 'template' ? 'step step-templates' : 'step'}
      >
        {step === 'category' ? (
          <CategoryStep chosen={state.category} onChoose={choose} />
        ) : null}

        {step === 'details' && state.category ? (
          <DetailsStep
            category={state.category}
            title={state.title}
            price={state.price}
            city={state.city ?? ''}
            street={state.street ?? ''}
            priceNote={state.priceNote ?? ''}
            titleError={here.some((blocker) => blocker.code === 'titleMissing')}
            cityError={here.some((blocker) => blocker.code === 'cityMissing')}
            onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
          />
        ) : null}

        {step === 'photos' ? (
          <>
            <PhotosStep
              photos={photos}
              onChange={changePhotos}
              signedIn={signedIn}
              category={state.category}
            />
            {state.category === 'vehicle' && signedIn ? (
              <SpinEditor frames={spin} onFrames={setSpin} onUpload={uploadSpin} uploading={extraUploading} />
            ) : null}
          </>
        ) : null}

        {step === 'rooms' ? (
          <>
            <RoomsStep photos={photos} onChange={changePhotos} />
            {signedIn ? (
              <PlanEditor plan={plan} onPlan={setPlan} onUpload={uploadPlan} uploading={extraUploading} />
            ) : null}
          </>
        ) : null}

        {step === 'plate' ? (
          <PlateStep
            plate={plate}
            onPlate={setPlate}
            declared={declaredOwner}
            onDeclare={setDeclaredOwner}
            facts={state.facts}
            onFacts={(facts) => setState((current) => ({ ...current, facts }))}
          />
        ) : null}

        {step === 'consent' ? (
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

        {step === 'facts' && state.category ? (
          <FactsStep
            category={state.category}
            facts={state.facts}
            onChange={(facts) => setState((current) => ({ ...current, facts }))}
            audience={state.audience}
            onAudience={(audience) =>
              setState((current) => {
                if (audience === undefined) {
                  const { audience: _omitted, ...rest } = current;
                  return rest;
                }
                return { ...current, audience };
              })
            }
          />
        ) : null}

        {step === 'disclosures' ? (
          <DisclosuresStep
            items={state.disclosures ?? []}
            category={state.category}
            onChange={(disclosures) => setState((current) => ({ ...current, disclosures }))}
          />
        ) : null}

        {step === 'preview' ? (
          <LivePreview state={state} photos={photos} profile={profile} extras={extras} sun={sunPoint} />
        ) : null}

        {step === 'publish' ? (
          <PublishStep
            state={state}
            blockers={outstanding}
            publishedUrl={publishedUrl}
            publishedSlug={slug.current ?? undefined}
            publishing={publishing}
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
        ) : null}

        {step === 'template' ? (
          <TemplateStep
            category={state.category}
            chosen={state.template}
            onChoose={(template) => setState((current) => ({ ...current, template }))}
            accent={state.accent ?? profile.accent ?? undefined}
            onAccent={(accent) => {
              accentSource.current = 'manual';
              setState((current) => ({ ...current, accent }));
            }}
            accentFromCover={accentSource.current === 'cover'}
            coverTone={coverTone}
            photos={photos
              .map((photo) => photo.publicUrl ?? photo.url)
              .filter((url): url is string => url.trim() !== '')}
            suggestion={
              state.category
                ? suggestTemplate({
                    category: state.category,
                    facts: state.facts,
                    street: state.street,
                    namedRooms: new Set(photos.map((photo) => photo.room).filter(Boolean)).size,
                    hasFloorPlan: plan !== undefined,
                  })
                : undefined
            }
          />
        ) : null}

        {step === 'description' ? (
          <DescriptionStep
            text={state.description}
            generated={state.generatedDescription}
            facts={state.facts}
            onChange={(description) => setState((current) => ({ ...current, description }))}
            onSuggest={canSuggest ? () => suggest() : undefined}
            suggesting={suggesting}
            suggestFailed={suggestFailed ? t('editor.description.suggestFailed') : undefined}
            source={suggestSource}
            tone={tone}
            onTone={(next) => {
              setTone(next);
              if (next !== tone) suggest(1, next);
            }}
          />
        ) : null}
      </section>

      {step === 'photos' && photosBusy ? (
        <p className="hint">{t('editor.photosUploading')}</p>
      ) : null}

      {/* A save that failed is said out loud on whatever step the seller is
          on. The publish step gets it inside PublishStep, beside the button
          that did nothing. */}
      {failure && step !== 'publish' ? (
        <p className="publish-failure" role="alert">
          {failure}
        </p>
      ) : null}

      {here.length > 0 && step !== 'details' ? (
        <section className="blockers" role="alert">
          <h2 className="blockers-title">{t('editor.blockedTitle')}</h2>
          <ul>
            {here.map((blocker) => (
              <li key={`${blocker.code}:${blocker.factLabel ?? ''}`}>
                {/*
                  Both placeholders every time. Only the message that contains
                  one uses it, and passing the cap from MAX_IMAGES keeps 25 in
                  the single place that defines it.
                */}
                <Message
                  path={`editor.blockers.${blocker.code}`}
                  values={{ max: MAX_IMAGES, label: blocker.factLabel ?? '' }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Words, no chevrons. Back and forward ARE direction icons and so they
        would have to flip in Hebrew (§4.3) — but ‹ and › are bidi-MIRRORED
        characters: the browser already flips them inside an RTL paragraph, so
        writing the flipped one flips it twice and both arrows end up pointing
        the same way. The icons come with the design pass, as SVG, where the
        flip is ours to control.
      */}
      <footer className="nav">
        <button type="button" className="nav-back" onClick={() => go(-1)} disabled={position <= 0}>
          {t('common.back')}
        </button>

        <button
          type="button"
          className="nav-next"
          onClick={() => go(1)}
          disabled={
            position >= steps.length - 1 || !canAdvance(step, state) || (step === 'photos' && photosBusy)
          }
        >
          {t('common.next')}
        </button>
      </footer>
    </div>

    {step !== 'preview' ? (
      <aside className={peekOpen ? 'facsimile is-open' : 'facsimile'} aria-label={t('editor.facsimile')}>
        {peekOpen ? (
          <button type="button" className="peek-close" onClick={() => setPeekOpen(false)}>
            {t('editor.peekClose')}
          </button>
        ) : null}
        <LivePreview state={state} photos={photos} profile={profile} extras={extras} sun={sunPoint} />
      </aside>
    ) : null}

    {step !== 'preview' ? (
      <button type="button" className="peek-open" onClick={() => setPeekOpen(true)}>
        {t('editor.peek')}
      </button>
    ) : null}
    </div>
  );
}

interface CategoryProps {
  chosen: EditorState['category'];
  onChoose: (category: NonNullable<EditorState['category']>) => void;
}

/**
 * The first question, and the one that decides the rest of the flow — a
 * vehicle gets a plate step and a property does not.
 *
 * The list comes from the schema registry rather than being written out here,
 * so a third category appears in this picker by existing.
 */
function CategoryStep({ chosen, onChoose }: CategoryProps) {
  return (
    <ul className="choices">
      {LISTING_CATEGORIES.map((category) => (
        <li key={category}>
          <button
            type="button"
            className={category === chosen ? 'choice chosen' : 'choice'}
            aria-pressed={category === chosen}
            onClick={() => onChoose(category)}
          >
            {schemaFor(category).label}
          </button>
        </li>
      ))}
    </ul>
  );
}
