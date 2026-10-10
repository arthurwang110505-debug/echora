# Contributing to Echora

Two things in this repository are load-bearing and easy to break by accident: the **ported stage
engine**, which has to stay comparable to upstream, and the **animation rules** below, which exist
because breaking one of them freezes the app on Linux after about half an hour of playback.

## Running the gates

Everything CI runs, in the order CI runs it:

```bash
pnpm install --frozen-lockfile
pnpm typecheck      # packages/web/tsconfig.json AND tsconfig.unused-checks.json — both must pass
node scripts/check-visualizer-types.mjs
pnpm lint           # 0 errors; the 24 pre-existing warnings are not a reason to add a 25th
pnpm test           # vitest
pnpm build          # runs the whole-tree tsc first, so a type error fails the build
node scripts/check-bundle-size.mjs
node scripts/check-dead-code.mjs --budget 3900
```

`pnpm typecheck` covers all of `src`. It used to skip `src/original-folia-visualizers`, `src/utils`
and `src/types.ts` — roughly 70,600 of 107,900 lines, the entire stage engine — and two live defects
sat in that blind spot for who knows how long, reported by nothing: a `ReferenceError` on the main
path of every sonnet scene build, and a registry entry with no `render` field that made selecting
商籁 throw. See `docs/echora-vs-folia-gap-and-plan.md` §3.3. `tsconfig.json`'s `exclude` list is now
five named files, each with a comment stating what has to happen for it to come off. **Adding to that
list means writing that comment.**

`scripts/check-dead-code.mjs` walks the import graph from the real entry points, counts tests as
consumers, and reports what nothing can reach. It cannot see string-path references — a
`readFileSync` in a test, `new Worker(new URL(...))`, a Vite `?raw` import — so before deleting
anything it names, grep the basenames against the config files and the tests.

## Ported code

Echora incorporates visualizer work from
[`chthollyphile/folia-major`](https://github.com/chthollyphile/folia-major) under AGPL-3.0; see
`UPSTREAM_NOTICE.md`. Ported files carry a header like:

```
// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/utils/glowBlurQuantize.ts
// @note Version Control: Project Folia version 0.7.16-de09ad5
```

**Leave those headers alone** — verbatim, untranslated, including the `@ai-ignore` lines that
sometimes follow them.

Beyond the headers, the rule is token identity: with comments and strings stripped, a ported file's
token stream should match upstream's. `docs/lumiere-port.zh-TW.md` §2.2 is the reference, and it is
explicit that permitted changes are *"adding comments, changing string contents, replacing dead
expressions — not changing logic."* This is why `tsconfig.json` leaves `noUnusedLocals` and
`noUnusedParameters` off: upstream does not enable them either, so the 77 unused declarations in the
stage tree are upstream's own code, not debt. Deleting them to satisfy a flag upstream never turned on
would break the comparison and make every future re-sync harder, buying nothing. Unused-declaration
hygiene is still enforced on Echora-authored code, by `tsconfig.unused-checks.json`.

When you fix a bug in a ported file, check whether upstream already has the fix. Twice now the answer
has been yes, and the Echora bug turned out to be a line the port dropped — restoring it moves the
file *toward* upstream's token stream instead of away from it.

## Animation guardrails

Adapted from upstream's `docs/linux-glyph-cache-fd-leak.md` §5 (写新动画时). These are not style
preferences. The symptom of breaking one is specific and nasty: after 30–40 minutes of playback on
Linux, the lyric animation freezes solid while the audio keeps playing, because Chromium caches
glyphs per *strike*, the strike key includes the blurred shadow's device-space sigma, and each new
combination costs a 4 KiB shared-memory chunk that is never returned. The renderer's fd soft limit is
1024. Upstream measured 0.56–0.93 fd/s across classic, partita, claddagh and cadenza, and −0.003 to
+0.002 after fixing it.

1. **Never animate a text shadow's blur radius per frame.** That means `text-shadow` in CSS and
   `shadowBlur` on a canvas. For a bloom or breathing effect, use `filter: drop-shadow()` — a filter
   is applied to the drawn layer and never reaches the glyph cache, so its radius may animate freely.
   If you must use a shadow, restrict the radius to a bounded set of values by routing it through
   `quantizeShadowBlur()` in `utils/glowBlurQuantize.ts`.

2. **Never re-rasterize shadowed text at a continuously varying device size.** In the DOM, text whose
   `scale()` changes every frame must either be its own compositing layer (`will-change: transform`)
   or carry no `text-shadow`. On a canvas, do not draw text under a continuously changing scale —
   rasterize it at a bounded set of steps first and place the raster under the camera afterwards
   (see `fume/fumeLiveRaster.ts`).

3. **Hang any new mitigation off the existing switch** — `isGlowBlurQuantized()` — and keep the old
   behaviour intact when it is off. One switch, one storage key
   (`visualizer_glow_blur_quantize`), one platform rule. The bug this fixed was live in four modes
   partly because a fifth (fume) had already solved it privately, so the fix never generalised.

4. **Patterns that are safe**, and are what the fix uses: a fixed radius animating only its alpha or
   colour; a `steps()` transition; `filter: drop-shadow()` / `filter: blur()`; compositor transforms
   on an element that is already a compositing layer.

### Verifying it

Upstream's fourth rule is "open the memory monitor on Linux, play for a few minutes, and check the
renderer and GPU fd curves are flat." **Echora cannot do that.** It is a PWA: a browser cannot read
`/proc/<pid>/fd`, and there is no Electron main process to ask. Upstream's `MemoryMonitorWindow` and
`electron/debug/memoryMonitor.cjs` have no web equivalent, so the fd curve is not portable and
should not be re-attempted.

What replaces it, and what to run instead:

- **`pnpm test` is the regression guard.** `utils/glowBlurQuantize.test.ts` sweeps an animated radius
  through `quantizeShadowBlur` and counts the distinct glyph-cache keys, on any platform: 1200 draws
  collapse to **48** whole pixels with the switch on, and stay at 48 with ten times the duration;
  with the switch off it is **1200 distinct, growing linearly to 12,000** — one new key per draw,
  against a fixed budget of 1024 handles. Linear growth in that set *is* the leak. If you add a glow
  path, add it to that sweep.
- **On a real device**, `?stageProbe=1` (or `localStorage.setItem('echora.stageProbe', '1')`) and
  `__echoraStageReport()` in the console. `docs/stage-measurement.zh-TW.md` explains how to read it.
- Note that the probe's frame-time numbers **cannot detect this failure** and never will: a frozen
  stage renders cheaply, so a stalled timeline reports a healthy `p95` and zero stalls. That is what
  the `clock advanced` field is for.

## Adding a visualizer mode

`src/original-folia-visualizers/registry.tsx` discovers modes with
`import.meta.glob('./*/entry.tsx')`, and `VisualizerRenderer.tsx` resolves one with a direct call:
`getVisualizerRegistryEntry(mode).render(resolvedProps)`. So `render` is **required**, and it must be
a plain function taking props and returning an element — which is why `lazyVisualizer` returns
`(props) => <Suspense>…` rather than a `React.lazy` component. Sonnet shipped without `render` and
threw on selection. `stageModeWiring.test.tsx` now calls `render` for every registered mode, so a new
mode that gets this wrong fails the suite rather than the user's session.

Also add the mode to `VISUALIZER_OPTIONS` in `components/player/panel/stageOptions.ts` — the picker
and the registry are separate lists, and a mode in one but not the other silently falls back to
`classic` rather than erroring. The same test asserts the two agree.
