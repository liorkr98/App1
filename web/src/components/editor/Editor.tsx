import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  blockers,
  canAdvance,
  canPublish,
  MAX_IMAGES,
  stepsFor,
  type EditorState,
  type Step,
} from '@/features/listings/editor';
import { blankFacts } from '@/features/listings/fact-entry';
import { isPhotoRoom } from '@/features/listings/photo-rooms';
import { LISTING_CATEGORIES, schemaFor } from '@/features/listings/schemas';

import { isProfileComplete } from '@/features/agents/profile';

import { t } from '../../lib/i18n';
import { loadEntitlement } from '../../lib/entitlement';
import { createDraft, uploadOriginal } from '../../lib/listing-draft';
import { enqueuePublishJobs } from '../../lib/listing-jobs';
import { stripAndResize, uploadDerived } from '../../lib/listing-photo';
import { loadListing, publishListing, saveListing } from '../../lib/listing-save';
import { loadProfile } from '../../lib/profile';
import { recordEditorEvent } from '../../lib/editor-events';
import type { AgentProfile } from '@/features/agents/profile';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { ConsentStep } from './ConsentStep';
import { DescriptionStep } from './DescriptionStep';
import { DetailsStep } from './DetailsStep';
import { PreviewStep } from './PreviewStep';
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
 * BUILT SO FAR: category, photos, facts, description, template.
 *
 * STILL EMPTY — each renders its heading and nothing else:
 *   - preview. It has to show the real listing page, and the site is static
 *     output — so a faithful preview means either a draft URL built by the
 *     pipeline or rendering the page markup twice. That is a design decision,
 *     not a component.
 *
 * Photos are picked and ordered but NOT UPLOADED YET. The target is settled —
 * Supabase Storage, CLAUDE.md §2 — and the buckets already exist in
 * migration 0004; what is missing is the signed-upload call and the
 * credentials to make it, which are not mine to hold.
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
  // 'unknown' on any error rather than 'paid'.
  //
  // A seller can still reach the preview with this value, which is the
  // point: seeing the finished page is the conversion moment.
  // ==================================================================
  entitlement: 'unknown',
};

export default function Editor() {
  const [state, setState] = useState<EditorState>(START);
  const [step, setStep] = useState<Step>('category');

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
        if ('profile' in result) setProfile(result.profile);
        setState((current) => ({ ...current, sellerReady: ready }));
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
        mark(photo.id, { status: 'uploaded', path: result.path });
        continue;
      }

      const published = await uploadDerived(listingId.current, photo.id, processed);
      mark(photo.id, {
        status: 'uploaded',
        path: result.path,
        ...('error' in published ? {} : { publicUrl: published.url }),
        width: processed.width,
        height: processed.height,
      });
    }

    const id = listingId.current;
    if (id) {
      await saveListing(id, stateRef.current, latest).catch(() => undefined);
    }
  };

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
            facts: Array.isArray(row.facts) ? row.facts : current.facts,
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
          return next;
        });
        setStep('category');
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [signedIn]);

  /**
   * Restores a saved draft, then lands on step 1. A previous session used to
   * skip to photos (step 3) because category and details were already filled.
   *
   * Entitlement is untouched: `Draft` has no such field. See useDraft.
   */
  useDraft(
    state,
    (draft) => {
      if (skipDraftRestore.current) return;
      setState((current) => ({ ...current, ...draft }));
      setStep('category');
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
    void saveListing(id, stateRef.current, photos).catch(() => undefined);
  };

  /**
   * Publishes, and hands back the link.
   *
   * ======================== HUMAN REVIEW ========================
   * CLAUDE.md §8. The gate is `canPublish`, which is false whenever ANY
   * blocker stands — including the entitlement one, which fails closed on
   * anything that is not 'paid'. This function does not read or decide
   * entitlement; it refuses to act when the shared rule says no.
   * ==============================================================
   */
  const publish = () => {
    const id = listingId.current;
    if (!id || !canPublish(state) || publishing) return;

    setPublishing(true);

    void (async () => {
      // Save first. Publishing a row that is one step behind what the agent
      // sees is how a page ships without the description they just wrote.
      await saveListing(id, state, photos).catch(() => undefined);

      const result = await publishListing(id, state).catch(() => ({ error: 'failed' }) as const);
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
        });
        clearDraft();
      } else {
        void recordEditorEvent('publish', 'publish_fail', id);
      }
    })();
  };

  const go = (delta: number) => {
    if (delta > 0 && step === 'photos' && photosBusy) return;
    persist();
    const target = steps[position + delta];
    if (target) setStep(target);
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

      <section className="step">
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
            priceError={here.some((blocker) => blocker.code === 'priceMissing')}
            cityError={here.some((blocker) => blocker.code === 'cityMissing')}
            onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
          />
        ) : null}

        {step === 'photos' ? (
          <PhotosStep
            photos={photos}
            onChange={changePhotos}
            signedIn={signedIn}
            category={state.category}
          />
        ) : null}

        {step === 'rooms' ? (
          <RoomsStep photos={photos} onChange={changePhotos} />
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
          <PreviewStep
            state={state}
            photos={photos}
            agency={profile.agencyName ?? undefined}
            sellerName={profile.displayName ?? undefined}
            accent={profile.accent ?? undefined}
            agencyLogoUrl={profile.agencyLogoUrl?.trim() || undefined}
          />
        ) : null}

        {step === 'publish' ? (
          <PublishStep
            state={state}
            blockers={outstanding}
            publishedUrl={publishedUrl}
            publishedSlug={slug.current ?? undefined}
            publishing={publishing}
            onPublish={publish}
            onCopy={(url) => void navigator.clipboard.writeText(url).catch(() => undefined)}
            onIndexable={(indexable) => setState((current) => ({ ...current, indexable }))}
            onPrePortal={(prePortal) => setState((current) => ({ ...current, prePortal }))}
          />
        ) : null}

        {step === 'template' ? (
          <TemplateStep
            chosen={state.template}
            onChoose={(template) => setState((current) => ({ ...current, template }))}
          />
        ) : null}

        {step === 'description' ? (
          <DescriptionStep
            text={state.description}
            generated={state.generatedDescription}
            facts={state.facts}
            onChange={(description) => setState((current) => ({ ...current, description }))}
          />
        ) : null}
      </section>

      {step === 'photos' && photosBusy ? (
        <p className="hint">{t('editor.photosUploading')}</p>
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
        <button type="button" onClick={() => go(-1)} disabled={position <= 0}>
          {t('common.back')}
        </button>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={
            position >= steps.length - 1 || !canAdvance(step, state) || (step === 'photos' && photosBusy)
          }
        >
          {t('common.next')}
        </button>
      </footer>
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
