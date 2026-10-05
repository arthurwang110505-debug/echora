# Why the Sonnet (商籁) and Diorama (镜台) stages stall — and what was fixed

Investigation against [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) at
`master` (package version 0.7.13), compared with the vendored snapshot in
`packages/web/src/original-folia-visualizers/`.

## TL;DR

Echora's `original-folia-visualizers` is a **pre-2026-08-30 Folia tree with local edits layered on
top**. Upstream fixed exactly these stalls in a handful of commits after the snapshot was taken, and
those fixes are missing here. On top of that, Echora's own adaptive "stage performance tier" is wired
so that a tier change tears down and re-creates GPU resources (for Sonnet, the whole Pixi runtime),
which turns any transient hiccup into a rebuild loop.

| # | Symptom | Root cause | Fixed in |
|---|---------|-----------|----------|
| 1 | Sonnet freezes for hundreds of ms every time the paragraph/shot changes | Text measurement is not memoised, so every scene build re-measures every grapheme through pretext. Folia `a69dd947` ("fix：未缓存测量结果…") | `sonnetTypographyLayout.ts`, `sonnetTextViewBuilder.ts` |
| 2 | Sonnet blanks and restarts on every track change, theme switch and tier flip | The runtime lives in a React effect whose deps include `program`/`theme`/`tuning`/`performanceTier`, so React destroys the WebGL context and re-creates it. Folia `a69dd947` ("…且有重复场景计算") added `swapSong`/`pixiRuntimeHost` for exactly this | `VisualizerSonnet.tsx`, `createSonnetPixiRuntime.ts` |
| 3 | Both stages stutter forever on mid-range devices | The frame-budget observer demotes after 8 slow frames and promotes again after 3 s of good frames; each flip re-created the Sonnet Pixi runtime and re-configured the Diorama canvas | `stagePerformance.ts`, `VisualizerSonnet.tsx`, `VisualizerDiorama.tsx` |
| 4 | Diorama's camera "stops locking onto the lyric": it flies off and frames `......`, or parks frozen with the line half off-screen | Interlude (`......`) lines are treated as real lyrics, and `resolveHoldSettle` is missing. Folia `c0401f9e` | `VisualizerDiorama.tsx`, `cameraPath.ts`, `CameraRig.tsx` |
| 5 | Diorama looks choppy/frozen on anything below the `full` tier | Echora renders the Canvas with `frameloop="demand"` + a `setInterval` at 30/45 fps for non-`full` tiers | `VisualizerDiorama.tsx` |

## 1. Sonnet: uncached text measurement (the big one)

Upstream's own words, in the commit that added the memo (`a69dd947b9e0679685f0a243434060ec15c96781`,
2026-08-30, *"feat: sonnet tempera添加切歌过渡 / fix：未缓存测量结果且有重复场景计算"*):

> Measurement is memoised across every caller. … Without it every scene re-measured the same
> graphemes from scratch through pretext – **per character, per shot, per paragraph** – which is
> **the bulk of what a scene build costs**.

Echora's `sonnetTypographyLayout.measureText` is byte-for-byte the pre-fix version:

```ts
export const measureText = (text: string, fontSpec: string, fontSize: number) => {
    try {
        const layout = layoutWithLines(prepareWithSegments(text || ' ', fontSpec), 99999, fontSize * 1.2);
        return layout.lines[0]?.width ?? text.length * fontSize * 0.6;
    } catch { /* … */ }
};
```

`resolveSonnetTypographyLayout` calls it once per segment, plus **once per grapheme** for vertical /
CJK columns and again for poster-block columns; `buildSonnetGlyphLayout` (via
`sonnetTextViewBuilder.measureText`, a second uncached copy) then measures every glyph of the same
text again.

Scene building runs **synchronously inside the Pixi ticker on the frame the paragraph changes**
(`createSonnetPixiRuntime.renderFrame` → `ensureScene`), so that extra work lands as a dropped frame
exactly when the new shot appears.

### Measured

`@chenglou/pretext` needs a real canvas, so the layout was benchmarked in Node against the repo's
actual modules with a stubbed measurement backend (`prepareWithSegments`/`layoutWithLines` counted,
8 shot kinds × 3 lyric lines = 24 layout calls):

| | pretext calls | 2nd identical pass |
|---|---|---|
| Echora before (no memo) | **766** | **17.59 ms** |
| Upstream's memo, as applied | **213** | **2.79 ms** |
| Patched repo file (re-run) | 213 | 3.53 ms |

The same inputs produced 766 pretext passes for 213 distinct strings — 3.6× redundant work — and a
repeat of an identical layout cost ~5× more. (The stub understates a real canvas, so treat these as a
lower bound.) The regression test `sonnetTypographyMeasure.test.ts` pins the memo.

## 2. Sonnet: the runtime is destroyed and re-created by React

Before this change:

```ts
useEffect(() => { /* SonnetPixiRuntime.create(...) */ }, [
  currentTime, lyricsFontScale, program, effectiveSonnetTuning, performanceTier,
  staticMode, theme,
]);
```

`program` changes on every track change, `theme` on every theme edit, `effectiveSonnetTuning` on
every tuning slider *and* on every tier flip. Each one runs `create()` → `destroy()`: a new
`pixi.Application`, new WebGL context, new texture pool, canvas detached from the DOM for the whole
async build (a blank frame), all scenes re-laid-out from scratch.

Upstream solved this in the same commit with `pixiRuntimeHost.ts` + `songHandover.ts` +
`SonnetPixiRuntime.swapSong()`:

> Those runtimes used to list every song-scoped input in their create effect's dependency array, so a
> track change destroyed the WebGL context, the texture pool and the whole scene cache and rebuilt
> them from scratch – **with the canvas gone from the DOM for the whole async build**.

The fix here adopts that semantic without porting the whole dissolve machinery: the runtime is
created once per mount and receives `setSceneInputs()` / `setPerformanceTier()` in place. Nothing
re-initialises the renderer — only the scene cache is dropped, and the next ticker frame re-lays-out
the active paragraph (neighbour pre-roll stays one-per-frame). Upstream still rebuilds on a *tuning*
change (`rebuildKey` includes `sonnetTuning`); this keeps those hot as well, since it can do so
without losing the context.

## 3. The adaptive tier loop (Echora-only amplifier)

`useStagePerformanceProfile` demotes on 8 frames slower than 42 ms and re-promoted after 180 good
frames (~3 s at 60 fps). Because the tier was in the runtime effect's deps, the promotion's own
rebuild supplied the next 8 slow frames — a permanent rebuild loop on any device that sits on the
edge. The tier also drives `LatentBackground`'s shader pixel budget, `GeometricBackground`'s shape
counts and the Diorama canvas' `dpr`, all of which re-create GPU resources.

Two changes:

* the observer may promote at most twice per mount (`demotionsRef`), so a device that has proved it
  cannot hold a tier stops being bounced between tiers;
* `useLatchedStageTier()` exposes the **lowest** tier a mount has settled on. Structural decisions
  (Sonnet's `textureResolution`, Diorama's canvas `dpr`/`antialias` and resident budgets, the shell
  background's budgets) read the latched tier; only cheap per-frame knobs (Sonnet's `ticker.maxFPS`,
  the background's frame interval) follow the live tier.

## 4. Diorama: the camera leaves the lyric (upstream `c0401f9e`)

`attachInterludes` inserts a `'......'` placeholder into **every gap longer than 3 s**. Upstream's
comment describes the exact symptom:

> …the diorama not special-casing it meant the camera left the line the viewer is reading, flew a
> full cinematic shot forward, and framed six dots for the length of the gap. **That is what "the
> camera stops locking onto the lyric after a while" is.**

and for `resolveHoldSettle`:

> Held through an instrumental they stop being composition: `progress` is pinned at 1, so the shot
> freezes at its most extreme pose and the two lateral offsets park the lyric hard against the edge
> of frame with nothing moving to justify it. Measured over the shot language at default settings,
> **21.7 % of held frames have an end of the current line off screen**, against 3.3 % mid-line.

Both are missing in Echora (the `settle` factor, the `isInterludeLine` branch and the whole
`resolveHoldSettle` function). Both are now ported; `cameraPath.test.ts` covers the easing.

## 5. Diorama: `frameloop="demand"` + interval throttling

For `balanced`/`compact` tiers Echora rendered the R3F canvas with `frameloop="demand"` driven by a
`setInterval(invalidate, 1000/45 | 1000/30)`, and switched `dpr`/`antialias` live. The 3D flythrough
*is* the composition, so a 30 fps interval-driven loop reads as a stuck stage, and every tier flip
changed the canvas configuration mid-playback. The canvas now renders continuously
(`frameloop="always"`) and takes `dpr`/`antialias` from the latched tier, which is what the upstream
stage does.

## Verification

* `pnpm --filter=@echora/web exec tsc --noEmit` — clean
* `pnpm --filter=@echora/web test` — 49 files / 270 tests pass (23 new: measure memo, hold settle,
  song-handover curve, stage probe)
* `pnpm bench` — sonnet program compile: 33 ms median for a 120-line song (budget 90 ms)
* `pnpm build` — succeeds; `node scripts/check-bundle-size.mjs` — passes
* Layout benchmark above (766 → 213 pretext calls, 17.59 ms → 3.53 ms on the repeat pass)

The `songHandover` dissolve listed below was implemented afterwards; the measurement layer that
makes the remaining work checkable on a real device is in `docs/stage-measurement.zh-TW.md`.

Browser profiling could not be run in this sandbox (Playwright's browser CDN is unreachable), so a
pass on a real device — skip tracks, drag the tuning sliders, switch themes, wait through an
instrumental — is still worth doing.

## Remaining upstream work (not done here)

* ~~The full `songHandover` dissolve~~ — **done**: `sonnet/songHandover.ts` holds the outgoing
  picture in a dedicated container and cross-fades it over `SONNET_SONG_SWAP_MS` (560 ms) while the
  incoming program lays out its first scene. Still missing from that mechanism: upstream's
  wall-clock cover for the case where the incoming build outlasts the dissolve.
* `mod()`/`setModulation` (Folium mod tunables) and `transparentBackground` from the same commit.
* `loadPixi()`'s `highp` fragment-precision flip (Folia `2bd643a`, Linux/NVIDIA black-triangle fix).
* Sonnet's `repeatEdgePixels = true` on the outro/transition blur filters (vignette drift when the
  blur ramps).
