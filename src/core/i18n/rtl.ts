import { I18nManager } from 'react-native';
import { MMKV } from 'react-native-mmkv';

/**
 * RTL bootstrap (CLAUDE.md §4.5).
 *
 * THIS IS THE ONLY PLACE IN THE CODEBASE THAT MAY CALL forceRTL.
 *
 * How RTL actually gets turned on
 * ------------------------------
 * Primarily by the `expo-localization` config plugin, which writes the RTL
 * flags into Info.plist and AndroidManifest.xml at build time (see app.json:
 * `["expo-localization", { "supportsRTL": true, "forcesRTL": true }]`).
 * Because that happens natively before any JavaScript runs, the very first
 * frame the user sees is already right-to-left — no flash, and no reload.
 *
 * The calls below are the JavaScript-side belt to that braces. They matter in
 * two cases: Expo Go, which resets RTL preferences when it opens a project,
 * and any build produced before the plugin was configured.
 *
 * Why the persisted flag
 * ----------------------
 * `forceRTL` only takes effect after the app restarts. A naive implementation
 * reloads whenever `isRTL` is false, which on a platform that refuses to apply
 * the flag becomes an infinite reload loop. Recording that we have already
 * forced RTL once lets `initRTL` report "this needs a restart" exactly once
 * and then stop asking.
 */

const STORAGE_ID = 'app.rtl';
const ALREADY_FORCED_KEY = 'alreadyForced';

let storage: MMKV | undefined;

/** Lazily created so importing this module never touches the native layer. */
function store(): MMKV {
  storage ??= new MMKV({ id: STORAGE_ID });
  return storage;
}

let hasRun = false;

/**
 * Forces right-to-left layout. Call once, as early as possible, before React
 * renders anything.
 *
 * @returns `true` when the app must be restarted for RTL to take effect. With
 * the config plugin in place this is always `false`, so callers can normally
 * ignore it. It is returned rather than acted on here because this module must
 * not decide how the app presents a restart — that is a UI concern.
 */
export function initRTL(): boolean {
  if (hasRun) {
    return false;
  }
  hasRun = true;

  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);

  // Already right-to-left: the native flags did their job. Nothing to do.
  if (I18nManager.isRTL) {
    store().set(ALREADY_FORCED_KEY, true);
    return false;
  }

  // Not right-to-left yet. If this is the first time we have asked, a restart
  // will apply it. If we have asked before and it still has not stuck, asking
  // again would loop forever — so report false and let the app run LTR rather
  // than trapping the user in a restart cycle.
  const alreadyAsked = store().getBoolean(ALREADY_FORCED_KEY) ?? false;
  store().set(ALREADY_FORCED_KEY, true);

  return !alreadyAsked;
}

/** Whether the app is currently laid out right-to-left. */
export function isRTL(): boolean {
  return I18nManager.isRTL;
}
