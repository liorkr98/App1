import * as Sentry from '@sentry/react-native';

import { env } from '@/core/config/env';

/**
 * Sentry initialisation with PII scrubbing (CLAUDE.md §8).
 *
 * NOTE: this lives in src/core/observability/, a folder not listed in
 * CLAUDE.md §3, alongside the root error boundary.
 *
 * The scrubbing below is deliberately aggressive. A crash report is not worth
 * leaking a user's email, and once PII is in Sentry it is in a third party's
 * storage and their retention policy, not yours.
 */

/** Keys whose values are replaced wholesale, wherever they appear. */
const SENSITIVE_KEYS = [
  'email',
  'phone',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'apikey',
  'api_key',
  'authorization',
  'secret',
  'address',
  'name',
  'display_name',
  'full_name',
];

const REDACTED = '[redacted]';

/** Matches anything that looks like an email, even inside a longer string. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Israeli phone numbers, local and +972 forms. */
const PHONE_PATTERN = /(?:\+972[-\s]?|0)\d{1,2}[-\s]?\d{7}/g;

/** JWTs, which carry the user id and email in the payload. */
const JWT_PATTERN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

function scrubString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED);
}

/**
 * Recursively redacts sensitive keys and patterns.
 *
 * Depth-limited because Sentry payloads can contain cyclic-ish structures and
 * an unbounded walk inside beforeSend would block the JS thread on a crash —
 * exactly when the app is least able to afford it.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;

  if (typeof value === 'string') {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEYS.includes(key.toLowerCase())
        ? REDACTED
        : scrub(item, depth + 1);
    }
    return output;
  }

  return value;
}

export function initSentry(): void {
  if (!env.sentry.dsn) {
    // No DSN configured. Staying uninitialised is correct — Sentry should not
    // be a hard requirement for the app to run.
    return;
  }

  Sentry.init({
    dsn: env.sentry.dsn,

    // sendDefaultPii would attach IP address, cookies and request headers.
    // Off, permanently.
    sendDefaultPii: false,

    // The user's own breadcrumbs frequently contain typed text.
    maxBreadcrumbs: 50,

    environment: __DEV__ ? 'development' : 'production',

    beforeSend(event) {
      // Identify the install, never the person. RevenueCat and Supabase both
      // key on the same id, so this is still enough to correlate a report.
      if (event.user) {
        event.user = { id: event.user.id };
      }

      if (event.request?.headers) {
        delete event.request.headers;
      }
      if (event.request?.cookies) {
        delete event.request.cookies;
      }

      if (event.extra) {
        event.extra = scrub(event.extra) as typeof event.extra;
      }
      if (event.contexts) {
        event.contexts = scrub(event.contexts) as typeof event.contexts;
      }
      if (event.message) {
        event.message = scrubString(event.message);
      }

      if (event.exception?.values) {
        for (const value of event.exception.values) {
          if (value.value) {
            value.value = scrubString(value.value);
          }
        }
      }

      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) {
        breadcrumb.message = scrubString(breadcrumb.message);
      }
      if (breadcrumb.data) {
        breadcrumb.data = scrub(breadcrumb.data) as typeof breadcrumb.data;
      }
      return breadcrumb;
    },
  });
}

/** Reports a handled error. The message is scrubbed by beforeSend. */
export function captureError(error: unknown): void {
  if (!env.sentry.dsn) {
    if (__DEV__) console.error(error);
    return;
  }
  Sentry.captureException(error);
}

export { scrubString as __scrubStringForTests, scrub as __scrubForTests };
