/**
 * The locale partition. `en.json` / `zh-TW.json` used to be imported by `i18n/index.ts`, which put
 * every string of both languages into the entry chunk — the shell carried the player's panel copy,
 * the privacy policy and the landing page whether or not anyone visited them, and the bundle
 * budget kept getting raised for copy that never belonged to the shell.
 *
 * Now each top-level section lives in exactly one file. `shell.*.json` is imported statically
 * (everything the entry chunk can render) and the rest are lazy bundles a route loads before it
 * renders. `src/i18n/localeBundles.test.ts` enforces the split by walking the import graph, so a
 * key rendered from the shell can never end up in a lazily loaded file.
 */

export type LocaleBundleName = 'home' | 'player' | 'settings' | 'library' | 'legal';

/** Which top-level locale sections travel in which lazy bundle. */
export const LOCALE_BUNDLE_SECTIONS: Record<LocaleBundleName, readonly string[]> = {
  home: ['welcome', 'appHome'],
  player: ['player', 'panel', 'ui', 'lyricSegmentation'],
  settings: ['settings'],
  library: ['library'],
  legal: ['privacy', 'terms'],
};

/**
 * Every lazily rendered route (keyed by the specifier `App.tsx` imports) and the bundle it loads
 * before rendering. `null` means the route is deliberately shell-only: the OBS overlay and the
 * OAuth callback must not drag the player's copy in, so the handful of strings they use ship in
 * `shell.*.json` instead.
 */
export const ROUTE_LOCALE_BUNDLES: Record<string, LocaleBundleName | null> = {
  './pages/Player': 'player',
  './pages/AppHome': 'home',
  './pages/Welcome': 'home',
  './pages/Settings': 'settings',
  './pages/Library': 'library',
  './pages/Privacy': 'legal',
  './pages/Terms': 'legal',
  './pages/ObsStage': null,
  './pages/YouTubeCallback': null,
};
