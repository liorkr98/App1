/**
 * @cloudimage/360-view ships a `.d.ts` that declares no exports, so TypeScript
 * reports "is not a module" on `import('@cloudimage/360-view')`.
 *
 * The library has no importable API anyway — it scans the DOM for
 * `.cloudimage-360` elements and reads its configuration from data
 * attributes, so the import exists purely for the side effect of running it.
 *
 * This declaration says exactly that, rather than suppressing the error at the
 * call site with a ts-expect-error that would also hide a real future problem.
 *
 * NOTE: this dependency exists only for the individual-frames fallback. The
 * sprite path is hand-rolled because the library cannot consume a sprite
 * sheet. If the sprite renderer is made the only path, both the dependency
 * and this file go away — see the note at the top of lib/viewers/spin.ts.
 */
declare module '@cloudimage/360-view';
