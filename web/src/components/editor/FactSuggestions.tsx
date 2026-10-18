import type { FactSuggestion } from '@/features/listings/fact-suggest';

import { t } from '../../lib/i18n';
import { Message } from './Message';

interface Props {
  suggestions: readonly FactSuggestion[];
  onAccept: (suggestion: FactSuggestion) => void;
  onDismiss: (suggestion: FactSuggestion) => void;
}

/**
 * What the photographs suggest (18 Oct 2026): one line each, confirmed with
 * a tap. A confirmed answer is the seller's own, like anything they type
 * (CLAUDE.md §7); "no" only hides the suggestion and records nothing, because
 * a model not being sure is not the seller saying it is absent.
 */
export function FactSuggestions({ suggestions, onAccept, onDismiss }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <section className="fact-suggestions" aria-labelledby="fact-suggestions-title">
      <h3 id="fact-suggestions-title">{t('editor.suggest.title')}</h3>
      <ul>
        {suggestions.map((suggestion) => (
          <li key={`${suggestion.key}-${suggestion.seen}`}>
            <span>
              {suggestion.kind === 'colour' ? (
                <Message path="editor.suggest.colour" values={{ colour: t(`editor.suggest.colours.${suggestion.seen}`) }} />
              ) : (
                t(`editor.suggest.seen.${suggestion.seen}`)
              )}
            </span>
            <button type="button" className="quiet" onClick={() => onAccept(suggestion)}>
              {t('editor.suggest.yes')}
            </button>
            <button type="button" className="quiet" onClick={() => onDismiss(suggestion)}>
              {t('editor.suggest.no')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
