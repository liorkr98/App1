import { useEffect, useRef } from 'react';

import { fromDraft, toDraft, type Draft } from '@/features/listings/draft';
import type { EditorState } from '@/features/listings/editor';

/** One draft per browser. There is no account yet to hang a second one off. */
const KEY = 'sivuv.draft.v1';

/** Long enough that typing does not write on every keystroke. */
const SAVE_AFTER_MS = 400;

/**
 * Keeps the draft in localStorage.
 *
 * PRD §4 locks "no account until publish", so until the seller pays there is
 * nowhere to put their work but their own browser. Without this, a call
 * arriving mid-form costs them everything they have entered.
 *
 * Every access is wrapped. localStorage is not reliably present: Safari in
 * private mode has historically thrown on write, a full quota throws, and a
 * browser set to block site data throws on READ, before anything is stored.
 * A draft is a convenience, and a convenience that can take the page down
 * with it is worse than not having it.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. What comes back from here is user-controlled text.
 *
 * `Draft` has no entitlement field — fromDraft cannot produce one — so the
 * restore below cannot grant access no matter what is in storage. The
 * property is in the TYPE rather than in a reset after the merge, because a
 * reset is one deleted line away from giving the product away and the
 * deletion would look like tidying.
 * ======================================================================
 */
export function useDraft(
  state: EditorState,
  restore: (draft: Draft) => void,
): void {
  const loaded = useRef(false);

  // Load once, before the first save can overwrite what is stored.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch {
      return;
    }

    const draft = fromDraft(raw);
    if (draft) restore(draft);

    // Empty deps, and `restore` is deliberately not among them. This must run
    // exactly once. A caller passing an inline function gives a new identity
    // every render, and with `restore` in the deps the effect would re-run and
    // overwrite whatever the seller had typed since — with their own draft,
    // which is the hardest kind of bug to believe when it is reported.
    //
    // The `loaded` guard above makes that safe rather than merely unlikely.
  }, []);

  useEffect(() => {
    // Nothing is written until the load has happened. Otherwise the first
    // render — an empty editor — saves over a real draft before it is read.
    if (!loaded.current) return;

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(toDraft(state)));
      } catch {
        // Out of quota, or storage blocked. The seller keeps working; they
        // simply lose the safety net. Nothing here is worth an interruption.
      }
    }, SAVE_AFTER_MS);

    return () => window.clearTimeout(timer);
  }, [state]);
}

/** Removes the stored draft. For after a publish succeeds. */
export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it, and nothing depends on it having worked.
  }
}
