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
  // `options` is the visualizer settings copy, and it lives in the player bundle because that is
  // where it is rendered: the quick-tuning panel hosts the Tempera canvas-image pool. A section
  // cannot have a file of its own - the file name is the bundle name - so it sits inside
  // player.*.json. The other modes' settings panels are still unreachable (see
  // docs/tempera-port.zh-TW.md), so their keys are not written down yet: a section can grow one
  // mode at a time, it just cannot be half a mode.
  player: ['player', 'panel', 'ui', 'lyricSegmentation', 'options'],
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
