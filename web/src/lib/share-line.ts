import { supabase } from './supabase';

/**
 * The agent's WhatsApp line (listings.share_line, 0046), and DeepSeek's
 * suggestions for it and for the title (/api/headline).
 *
 * Read and written apart from the editor's save on purpose: the column
 * arrives with a migration the owner runs by hand, and until it has, a save
 * that named it would fail every save of the listing. Here a missing column
 * only means no line.
 */

export async function readShareLine(listingId: string): Promise<string> {
  try {
    const { data, error } = await supabase().from('listings').select('share_line').eq('id', listingId).maybeSingle();
    const line = (data as { share_line?: unknown } | null)?.share_line;
    return !error && typeof line === 'string' ? line : '';
  } catch {
    return '';
  }
}

export async function saveShareLine(listingId: string, line: string): Promise<boolean> {
  const value = line.replace(/\s+/g, ' ').trim().slice(0, 160);
  try {
    const { error } = await supabase()
      .from('listings')
      .update({ share_line: value || null })
      .eq('id', listingId);
    return !error;
  } catch {
    return false;
  }
}

export interface HeadlineSuggestion {
  title?: string;
  line?: string;
}

/** Nothing when there is no key, no answer, or nothing that passed the rules. */
export async function suggestHeadline(listingId: string, tone: string): Promise<HeadlineSuggestion> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    const response = await fetch('/api/headline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ listingId, tone }),
    });
    if (!response.ok) return {};
    const body = (await response.json()) as HeadlineSuggestion;
    return {
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      ...(typeof body.line === 'string' ? { line: body.line } : {}),
    };
  } catch {
    return {};
  }
}
