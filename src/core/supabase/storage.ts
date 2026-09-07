import * as SecureStore from 'expo-secure-store';

/**
 * Session storage adapter backed by expo-secure-store (CLAUDE.md §8).
 *
 * Tokens go in the OS keychain/keystore, never AsyncStorage — AsyncStorage is
 * plain-text on disk and readable on a rooted or jailbroken device.
 *
 * Why the chunking
 * ----------------
 * SecureStore rejects values over 2048 bytes on Android. A Supabase session
 * holds an access token, a refresh token and the decoded user, which routinely
 * exceeds that once a user has metadata. Without chunking the write fails
 * silently-ish and the user is signed out on next launch, which is maddening
 * to debug because it only happens to *some* accounts.
 *
 * Layout: the primary key holds a manifest, `chunks:<n>`, and the pieces live
 * at `<key>.0`, `<key>.1`, ... A value small enough to fit is stored inline
 * with no manifest, so the common case costs one read.
 */

const MAX_CHUNK_SIZE = 1800; // Headroom under the 2048-byte Android limit.
const MANIFEST_PREFIX = 'chunks:';

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function clearChunks(key: string, count: number): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index)).catch(() => undefined),
    ),
  );
}

function parseManifest(value: string): number | null {
  if (!value.startsWith(MANIFEST_PREFIX)) {
    return null;
  }
  const count = Number.parseInt(value.slice(MANIFEST_PREFIX.length), 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head === null) {
        return null;
      }

      const count = parseManifest(head);
      if (count === null) {
        return head;
      }

      const parts = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
      );

      // A missing chunk means a partially written or partially wiped session.
      // Returning a truncated string would hand Supabase corrupt JSON, so
      // report "no session" and let the user sign in again.
      if (parts.some((part) => part === null)) {
        return null;
      }

      return parts.join('');
    } catch {
      // A keychain read can fail on a locked device. Treat it as signed out
      // rather than crashing at startup.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clear any previous chunks first, or a shrinking value leaves orphans
    // that a later read could splice back in.
    const previous = await SecureStore.getItemAsync(key).catch(() => null);
    const previousCount = previous ? parseManifest(previous) : null;
    if (previousCount !== null) {
      await clearChunks(key, previousCount);
    }

    if (value.length <= MAX_CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += MAX_CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + MAX_CHUNK_SIZE));
    }

    // Chunks first, manifest last: if the process dies mid-write, the manifest
    // is absent and the read path sees "no session" rather than a partial one.
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
    );
    await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${chunks.length}`);
  },

  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key).catch(() => null);
    const count = head ? parseManifest(head) : null;

    if (count !== null) {
      await clearChunks(key, count);
    }

    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  },
};
