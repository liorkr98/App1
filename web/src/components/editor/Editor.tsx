import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  blockers,
  canAdvance,
  canPublish,
  MAX_IMAGES,
  nextStep,
  stepsFor,
  type EditorState,
  type Step,
} from '@/features/listings/editor';
import { blankFacts } from '@/features/listings/fact-entry';
import { LISTING_CATEGORIES, schemaFor } from '@/features/listings/schemas';

import { isProfileComplete } from '@/features/agents/profile';

import { t } from '../../lib/i18n';
import { loadEntitlement } from '../../lib/entitlement';
import { createDraft, uploadOriginal } from '../../lib/listing-draft';
import { enqueuePublishJobs } from '../../lib/listing-jobs';
import { stripAndUploadDerived } from '../../lib/listing-photo';
import { loadListing, publishListing, saveListing, type SavedPhoto } from '../../lib/listing-save';
import { loadProfile } from '../../lib/profile';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { ConsentStep } from './ConsentStep';
import { DescriptionStep } from './DescriptionStep';
import { DetailsStep } from './DetailsStep';
import { DisclosuresStep } from './DisclosuresStep';
import { FactsStep } from './FactsStep';
import { Message } from './Message';
import { PhotosStep, type EditorPhoto } from './PhotosStep';
import { PlateStep } from './PlateStep';
import { PreviewStep } from './PreviewStep';
import { PublishStep } from './PublishStep';
import { TemplateStep } from './TemplateStep';
import { clearDraft, useDraft } from './useDraft';

/**
 * The editor island.
 *
 * Rules live in @/features/listings/editor. This file is the presentation of
 * those rules plus the trips to Supabase — save, upload, publish, entitlement.
 *
 * ============================ HUMAN REVIEW ============================
 * Entitlement is READ from loadEntitlement, never inferred here. A failed
 * read stays 'unknown' and canPublish stays false (CLAUDE.md §8).
 * ======================================================================
 */

const START: EditorState = {
  title: '',
  price: 0,
  indexable: false,
  photoCount: 0,
  facts: [],
  description: '',
  entitlement: 'unknown',
};

export default function Editor() {
  const [state, setState] = useState<EditorState>(START);
  const [step, setStep] = useState<Step>(() => nextStep(START));
  const [photos, setPhotos] = useState<EditorPhoto[]>([]);
  const [plate, setPlate] = useState('');
  const [declaredOwner, setDeclaredOwner] = useState(false);
  const listingId = useRef<string | null>(null);
  const listingSlug = useRef<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | undefined>();
  const [publishedSlug, setPublishedSlug] = useState<string | undefined>();
  const skipDraftRestore = useRef(false);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const client = supabase();
    void client.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));

    const { data: sub } = client.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

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
        setState((current) => ({ ...current, sellerReady: ready }));
      })
      .catch(() => {
        if (live) setState((current) => ({ ...current, sellerReady: false }));
      });

    void loadEntitlement().then((entitlement) => {
      if (live) setState((current) => ({ ...current, entitlement }));
    });

    return () => {
      live = false;
    };
  }, [signedIn]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id || !supabaseConfigured) return;

    skipDraftRestore.current = true;
    void loadListing(id).then((loaded) => {
      if ('error' in loaded) return;
      listingId.current = loaded.id;
      listingSlug.current = loaded.slug;
      setPhotos(
        loaded.photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          name: photo.id,
          status: 'uploaded' as const,
          publicUrl: photo.url,
          width: photo.width,
          height: photo.height,
        })),
      );
      setState((current) => ({
        ...current,
        category: loaded.category,
        title: loaded.title,
        price: loaded.price,
        indexable: loaded.indexable,
        ...(loaded.priceNote ? { priceNote: loaded.priceNote } : {}),
        ...(loaded.city ? { city: loaded.city } : {}),
        ...(loaded.street ? { street: loaded.street } : {}),
        facts: [...loaded.facts],
        description: loaded.description,
        ...(loaded.template ? { template: loaded.template } : {}),
        ...(loaded.audience ? { audience: loaded.audience } : {}),
        ...(loaded.disclosures ? { disclosures: loaded.disclosures } : {}),
        photoCount: loaded.photos.length,
      }));
      setStep(
        nextStep({
          ...START,
          category: loaded.category,
          title: loaded.title,
          price: loaded.price,
          indexable: loaded.indexable,
          facts: loaded.facts,
          description: loaded.description,
          template: loaded.template,
          photoCount: loaded.photos.length,
          sellerReady: true,
          entitlement: 'unknown',
        }),
      );
    });
  }, []);

  const uploadPending = async (current: EditorPhoto[], category: EditorState['category']) => {
    if (!supabaseConfigured || !signedIn || !category) return;

    const pending = current.filter((photo) => photo.status === 'local' && photo.file);
    if (pending.length === 0) return;

    const mark = (id: string, patch: Partial<EditorPhoto>) =>
      setPhotos((all) => all.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));

    try {
      if (!listingId.current) {
        const draft = await createDraft(category);
        listingId.current = draft.id;
        listingSlug.current = draft.slug;
      }
    } catch {
      for (const photo of pending) mark(photo.id, { status: 'failed' });
      return;
    }

    for (const photo of pending) {
      if (!photo.file || !listingId.current) continue;
      mark(photo.id, { status: 'uploading' });

      const original = await uploadOriginal(listingId.current, photo.file);
      if ('error' in original) {
        mark(photo.id, { status: 'failed' });
        continue;
      }

      const derived = await stripAndUploadDerived(listingId.current, photo.file, photo.id);
      if ('error' in derived) {
        mark(photo.id, { status: 'failed', path: original.path });
        continue;
      }

      mark(photo.id, {
        status: 'uploaded',
        path: original.path,
        publicUrl: derived.url,
        width: derived.width,
        height: derived.height,
      });
    }
  };

  const changePhotos = (next: EditorPhoto[]) => {
    setPhotos(next);
    setState((current) => ({ ...current, photoCount: next.length }));
    void uploadPending(next, state.category);
  };

  const steps = useMemo(() => stepsForSafe(state.category), [state.category]);
  const outstanding = useMemo(() => blockers(state), [state]);

  const position = steps.indexOf(step);
  const here = outstanding.filter((blocker) => blocker.step === step);

  useDraft(state, (draft) => {
    if (skipDraftRestore.current) return;
    setState((current) => ({ ...current, ...draft }));
    setStep(nextStep({ ...START, ...draft }));
  });

  const persist = async (next: EditorState, nextPhotos: readonly EditorPhoto[]) => {
    if (!listingId.current || !supabaseConfigured || !signedIn) return;
    const saved: SavedPhoto[] = nextPhotos
      .filter((photo): photo is EditorPhoto & { publicUrl: string } => Boolean(photo.publicUrl))
      .map((photo) => ({
        id: photo.id,
        url: photo.publicUrl,
        alt: '',
        width: photo.width ?? 1,
        height: photo.height ?? 1,
      }));
    await saveListing(listingId.current, next, saved);
  };

  const go = (delta: number) => {
    const target = steps[position + delta];
    if (!target) return;
    setStep(target);
    void persist(state, photos);
  };

  const choose = (category: NonNullable<EditorState['category']>) => {
    setState((current) =>
      current.category === category
        ? current
        : { ...current, category, facts: blankFacts(category) },
    );
  };

  const onPublish = async () => {
    if (!canPublish(state) || !listingId.current) return;
    setPublishing(true);

    await persist(state, photos);

    const result = await publishListing(listingId.current, state);
    if ('error' in result) {
      setPublishing(false);
      return;
    }

    const originals = photos.map((photo) => photo.path).filter((path): path is string => Boolean(path));
    void enqueuePublishJobs({
      listingId: listingId.current,
      originalPaths: originals,
      ...(photos[0]?.path ? { coverPath: photos[0].path } : {}),
      price: state.price,
    });

    clearDraft();
    const url = `${window.location.origin}/a/${result.slug}/`;
    setPublishedUrl(url);
    setPublishedSlug(result.slug);
    setPublishing(false);
  };

  return (
    <main className="editor">
      <header className="rail">
        <p className="rail-count">
          <Message
            path="editor.stepOf"
            values={{ current: position + 1, total: steps.length }}
          />
        </p>
        <h1 className="rail-title">{t(`editor.steps.${step}`)}</h1>

        <div className="rail-bar" aria-hidden="true">
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

        {step === 'details' ? (
          <DetailsStep
            state={state}
            onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
          />
        ) : null}

        {step === 'photos' ? (
          <PhotosStep photos={photos} onChange={changePhotos} signedIn={signedIn} />
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
            onDeclare={(ownerConsentDeclaredAt) =>
              setState((current) => ({ ...current, ownerConsentDeclaredAt }))
            }
          />
        ) : null}

        {step === 'facts' && state.category ? (
          <FactsStep
            category={state.category}
            facts={state.facts}
            onChange={(facts) => setState((current) => ({ ...current, facts }))}
            audience={state.audience}
            onAudience={(audience) => setState((current) => ({ ...current, audience }))}
          />
        ) : null}

        {step === 'disclosures' ? (
          <DisclosuresStep
            items={state.disclosures ?? []}
            onChange={(disclosures) => setState((current) => ({ ...current, disclosures }))}
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

        {step === 'preview' ? <PreviewStep state={state} photos={photos} /> : null}

        {step === 'publish' ? (
          <PublishStep
            state={state}
            blockers={outstanding}
            publishedUrl={publishedUrl}
            publishedSlug={publishedSlug}
            publishing={publishing}
            onPublish={() => void onPublish()}
            onCopy={(url) => void navigator.clipboard.writeText(url)}
            onIndexable={(indexable) => setState((current) => ({ ...current, indexable }))}
          />
        ) : null}
      </section>

      {here.length > 0 && step !== 'publish' ? (
        <section className="blockers" aria-live="polite">
          <h2 className="blockers-title">{t('editor.blockedTitle')}</h2>
          <ul>
            {here.map((blocker) => (
              <li key={`${blocker.code}:${blocker.factLabel ?? ''}`}>
                <Message
                  path={`editor.blockers.${blocker.code}`}
                  values={{ max: MAX_IMAGES, label: blocker.factLabel ?? '' }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {step !== 'publish' || !publishedUrl ? (
        <footer className="nav">
          <button type="button" onClick={() => go(-1)} disabled={position <= 0}>
            {t('common.back')}
          </button>

          <button
            type="button"
            onClick={() => go(1)}
            disabled={position >= steps.length - 1 || !canAdvance(step, state)}
          >
            {t('common.next')}
          </button>
        </footer>
      ) : null}
    </main>
  );
}

function stepsForSafe(category: EditorState['category']) {
  return stepsFor(category);
}

interface CategoryProps {
  chosen: EditorState['category'];
  onChoose: (category: NonNullable<EditorState['category']>) => void;
}

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
