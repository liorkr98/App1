import { whatsappShareUrl } from '@/features/listings/share-message';

import { t } from './i18n';
import { recordListingEvent } from './listing-events';
import '../styles/share-sheet.css';

/**
 * The share sheet: one tap from a published listing to WhatsApp, Facebook,
 * the phone's own share menu, or the clipboard (14 Oct 2026).
 *
 * WHY NOT AN API. Neither WhatsApp nor Facebook lets a website post into a
 * person's groups: WhatsApp's Business API sends set messages to people who
 * opted in, and Facebook removed posting to groups in 2024. What both do
 * allow is opening their own picker with the message ready, and the agent
 * choosing the groups and people there. That is this sheet.
 *
 * Facebook takes a link and no text (its policy), so its tile copies the
 * message first and says so: the agent pastes it into the post.
 *
 * Framework-free on purpose: the editor is a React island and /mine is a
 * plain script, and both open the same sheet.
 */

export interface ShareSheetData {
  /** Absolute page link. */
  url: string;
  /** The whole message, the link as its last line (share-text.ts). */
  message: string;
  title: string;
  price: string;
  cover?: string;
}

export interface ShareSheetOptions {
  slug: string;
  /** Right after publish: the heading says the page is live. */
  fresh?: boolean;
  /** Already known (fixtures, tests). Otherwise /a/{slug}/message.json. */
  data?: ShareSheetData;
}

/** Brand marks and universal symbols: none of these flip (CLAUDE.md §4.3). */
const ICONS = {
  whatsapp:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 7c0 5.45-4.44 9.88-9.89 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41z"/></svg>',
  facebook:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 21v-7.6h2.55l.38-2.97H13.6V8.54c0-.86.24-1.44 1.47-1.44h1.57V4.44a21 21 0 0 0-2.29-.12c-2.27 0-3.82 1.38-3.82 3.93v2.18H8v2.97h2.53V21h3.07z"/></svg>',
  more:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></g></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></g></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>',
} as const;

/**
 * A run of digits, or a link line, in its own <bdi> (CLAUDE.md §4.2) — the
 * same isolation the share kit uses for the same message. The text that is
 * SENT comes from the string, never from this markup.
 */
const NUMBER = /(₪?\d(?:[\d,./:-]*\d)?)/g;

function messageInto(parent: HTMLElement, message: string): void {
  parent.replaceChildren();
  message.split('\n').forEach((line, index) => {
    if (index > 0) parent.append(document.createElement('br'));
    if (/^https?:\/\//.test(line.trim())) {
      const link = document.createElement('bdi');
      link.className = 'ss-link';
      link.dir = 'ltr';
      link.textContent = line;
      parent.append(link);
      return;
    }
    let last = 0;
    for (const match of line.matchAll(NUMBER)) {
      if (match.index > last) parent.append(line.slice(last, match.index));
      const number = document.createElement('bdi');
      number.textContent = match[0];
      parent.append(number);
      last = match.index + match[0].length;
    }
    if (last < line.length) parent.append(line.slice(last));
  });
}

const facebookShareUrl = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

/** The message without its last line, for share targets that take the link separately. */
const withoutLink = (message: string, url: string) => message.replace(new RegExp(`\\n*${url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`), '').trim();

async function fetchData(slug: string): Promise<ShareSheetData | undefined> {
  try {
    const response = await fetch(`/a/${encodeURIComponent(slug)}/message.json`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return (await response.json()) as ShareSheetData;
  } catch {
    return undefined;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openShareSheet({ slug, fresh = false, data }: ShareSheetOptions): HTMLDialogElement {
  document.querySelector('dialog.ss')?.remove();

  const fallbackUrl = `${window.location.origin}/a/${slug}/`;
  let current: ShareSheetData = data ?? { url: fallbackUrl, message: fallbackUrl, title: '', price: '' };

  const dialog = element('dialog', 'ss');
  dialog.setAttribute('aria-label', t('shareSheet.dialog'));

  // --- Head -----------------------------------------------------------
  const head = element('header', 'ss-head');
  const heading = element('h2', 'ss-title', fresh ? t('shareSheet.titleFresh') : t('shareSheet.title'));
  const close = element('button', 'ss-close');
  close.type = 'button';
  close.setAttribute('aria-label', t('shareSheet.close'));
  close.innerHTML = ICONS.close;
  close.addEventListener('click', () => dialog.close());
  head.append(heading, close);

  // --- The message as it will arrive ----------------------------------
  const chat = element('div', 'ss-chat');
  const caption = element('p', 'ss-caption', t('shareSheet.preview'));
  const bubble = element('div', 'ss-bubble');
  const card = element('div', 'ss-card');
  const cover = element('img', 'ss-cover');
  cover.alt = '';
  cover.width = 600;
  cover.height = 314;
  cover.decoding = 'async';
  const cardText = element('div', 'ss-card-text');
  const cardTitle = element('b', 'ss-card-title');
  const cardHost = element('span', 'ss-card-host');
  cardHost.dir = 'ltr';
  cardText.append(cardTitle, cardHost);
  card.append(cover, cardText);
  const text = element('p', 'ss-text');
  bubble.append(card, text);
  chat.append(caption, bubble);

  // --- Targets, first is rightmost (RTL) ------------------------------
  const targets = element('div', 'ss-targets');
  const said = element('p', 'ss-said');
  said.setAttribute('role', 'status');
  said.setAttribute('aria-live', 'polite');

  const tile = (kind: keyof typeof ICONS, label: string, href?: string) => {
    const node = href ? element('a', `ss-tile ss-${kind}`) : element('button', `ss-tile ss-${kind}`);
    if (node instanceof HTMLAnchorElement && href) {
      node.href = href;
      node.target = '_blank';
      node.rel = 'noopener';
    } else if (node instanceof HTMLButtonElement) {
      node.type = 'button';
    }
    const icon = element('span', 'ss-icon');
    icon.innerHTML = ICONS[kind];
    node.append(icon, element('span', 'ss-label', label));
    node.addEventListener('click', () => void recordListingEvent(slug, 'share', null));
    return node;
  };

  const whatsapp = tile('whatsapp', t('shareSheet.whatsapp'), whatsappShareUrl(current.message)) as HTMLAnchorElement;
  const facebook = tile('facebook', t('shareSheet.facebook'), facebookShareUrl(current.url)) as HTMLAnchorElement;
  // Facebook will not take the text: put it on the clipboard on the way out,
  // inside the tap so the browser allows it, and say where it went.
  facebook.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(current.message)
      .then(() => {
        said.textContent = t('shareSheet.fbCopied');
      })
      .catch(() => undefined);
  });
  targets.append(whatsapp, facebook);

  if (typeof navigator.share === 'function') {
    const more = tile('more', t('shareSheet.more'));
    more.addEventListener('click', () => {
      // Text and link apart: iOS hands both to the app, and a message that
      // already ends with the link would arrive with it twice.
      void navigator
        .share({ title: current.title, text: withoutLink(current.message, current.url), url: current.url })
        .catch(() => undefined);
    });
    targets.append(more);
  }

  const copy = tile('copy', t('shareSheet.copy'));
  copy.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(current.url)
      .then(() => {
        said.textContent = t('shareSheet.copied');
      })
      .catch(() => {
        said.textContent = t('shareSheet.copyFailed');
      });
  });
  targets.append(copy);

  const lead = element('p', 'ss-lead', t('shareSheet.lead'));
  const kit = element('a', 'ss-kit', t('shareSheet.kit'));
  kit.href = `/a/${encodeURIComponent(slug)}/share/`;

  // The dialog has no padding of its own, so a click whose target is the
  // dialog itself can only have landed on the backdrop.
  const panel = element('div', 'ss-panel');
  panel.append(head, chat, targets, said, lead, kit);
  dialog.append(panel);

  const render = (loading: boolean) => {
    dialog.toggleAttribute('data-loading', loading);
    whatsapp.href = whatsappShareUrl(current.message);
    facebook.href = facebookShareUrl(current.url);
    cardTitle.textContent = current.price ? `${current.title} · ${current.price}` : current.title;
    cardHost.textContent = new URL(current.url).host;
    card.hidden = !current.cover && !current.title;
    if (current.cover) cover.src = current.cover;
    cover.hidden = !current.cover;
    if (loading) text.textContent = t('shareSheet.loading');
    else messageInto(text, current.message);
  };

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  render(!data);
  dialog.showModal();

  if (!data) {
    void fetchData(slug).then((loaded) => {
      if (loaded) current = loaded;
      render(false);
    });
  }

  return dialog;
}
