import { OWNER_COOKIE } from '@/features/analytics/count-rules';

/**
 * Marks this browser as an agent's while they are signed in, so their own
 * opens of their listings are not counted as buyers' views
 * (count-rules.ts). The cookie holds "1": not who, and nothing personal.
 * Cleared on sign-out.
 */
export function markOwner(signedIn: boolean): void {
  try {
    document.cookie = signedIn
      ? `${OWNER_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure`
      : `${OWNER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
  } catch {
    // A browser that refuses cookies is counted like any other.
  }
}
