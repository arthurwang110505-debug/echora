# Why the Tempera (凝彩) and Lumiere (繪光) stages are stuck — and what was fixed

Investigation against [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) at
`master` (package version 0.7.15), compared with the vendored tree in
`packages/web/src/original-folia-visualizers/`.

This is the same class of question as `docs/sonnet-diorama-stall-diagnosis.md`, and the answer is
the opposite shape: **the port is not stale.** Both mode trees are token-identical to current
upstream. What is broken is the clock Echora feeds them.

## TL;DR

Tempera and Lumiere are *timeline directors*: every frame they read one MotionValue and derive the
whole picture from it. Echora publishes that MotionValue from a React prop backed by the player
store, and the store is only written when the media source reports in — for local audio that is the
`<audio>` element's `timeupdate` event, about **4×/second**. So the stage renders 60 fps against a
timeline that moves 4 times a second: each composition pose is held for ~250 ms and then jumps.

Upstream does not have this problem because its clock is read from the media element *inside* its
`requestAnimationFrame` loop, so what it publishes is already per-frame.

| # | Symptom | Root cause | Fixed in |
|---|---------|-----------|----------|
| 1 | Tempera/Lumiere/Sonnet hold still and then jump; the stage reads as stuck while audio plays smoothly | The stage forwarded the store's `displayedTime` prop straight into the `currentTime` MotionValue. That prop moves at the source's report rate (`timeupdate` ≈ 4 Hz), not at frame rate. Upstream reads `audioElement.currentTime` inside its rAF loop (`usePlaybackVisualizerBridge.ts:134`) | `playback/stageClock.ts` (new), `components/OriginalFoliaVisualizerStage.tsx` |
| 2 | Dragging the progress bar **while paused** does not move the frozen picture | The stage's rAF loop is (correctly) stopped while paused, and nothing else published the prop into the MotionValue. `useMotionValue(x)` takes `x` only as its *initial* value | `components/OriginalFoliaVisualizerStage.tsx` |
| 3 | Any stage that has been tuned re-runs its whole tuning path ~4×/second | `applyVisualizerTuning` merged the bundle entry over the adapter defaults **into a fresh object on every render**, defeating the `if (previous === tuning) return;` identity guard both runtimes start `setTuning` with | `original-folia-visualizers/tuningRegistry.ts` |
| 4 | A track change cuts instead of handing over | The stage never passed `seed`, so `songHandover`'s commit gate could only decide from lyric text and the runtimes took their straight-through `swapSong` branch (`next.seed === this.options.songSeed`) — clear the scene cache, no dissolve | `components/OriginalFoliaVisualizerStage.tsx`, `pages/Player.tsx` |
| 5 | Fresh `background` object identity on every host render | Inline `background={{ mode }}` literal in the stage JSX, where upstream memoises it | `components/OriginalFoliaVisualizerStage.tsx` |

## 1. A 4 Hz clock driving a 60 fps director

### What the two modes do with the clock

Both runtimes start every frame the same way:

```ts
// createTemperaPixiRuntime.ts:680
private renderFrame = () => {
    if (this.destroyed) return;
    const time = this.options.currentTime.get();
    ...
    const paragraphIndex = findTemperaParagraphIndexAtTime(this.options.program, time);
```

```ts
// createLumierePixiRuntime.ts:277
private renderFrame = () => {
    if (this.destroyed) return;
    const time = this.options.currentTime.get();
    this.audio.sample(performance.now(), this.options.paused);
```

`time` selects the paragraph, the shot inside it, the camera pose, the transition phase and the
reveal progress. (`createSonnetPixiRuntime.ts:752` is the same shape, which is why Sonnet shows the
symptom too.) Nothing in that chain interpolates: a `time` that does not move produces a picture
that does not move, no matter how many frames the GPU pushes.

### What Echora fed it

```ts
// components/OriginalFoliaVisualizerStage.tsx, before this change
const time = timeProviderRef.current ? timeProviderRef.current() : timeRef.current;
...
currentTime.set(time);
```

`timeRef.current` is the `displayedTime` **prop**, which comes from `pages/Player.tsx` →
`usePlayerStore(state => state.currentTime)`. That store field is written by whoever owns the media:

| source | writer | rate |
|---|---|---|
| local `<audio>` (incl. every demo song) | `components/LocalAudioController.tsx:175` on the `timeupdate` event | ~4/s (the HTML spec fires it every 15–250 ms) |
| YouTube Music | `components/YouTubePlayer.tsx:139` `setInterval` poll of the iframe API | 10/s |
| landing preview | `components/landing/LiveStage.tsx:69` `setInterval` | 10/s |
| OBS overlay | 5 Hz clock message over the wire | 5/s |

`PlayerContext.tsx` even excludes `local` from its 100 ms UI ticker on purpose ("YouTube and Spotify
report real time through their own player APIs. Only local playback may use a UI ticker"), so for the
main path `timeupdate` is the *only* thing that moves the clock.

The stage's rAF loop therefore ran at 60 Hz and wrote the **same stale number** about 15 times in a
row before jumping.

### What upstream feeds it

```ts
// usePlaybackVisualizerBridge.ts:134 — inside the rAF loop (line 230: requestAnimationFrame(updateLoop))
const time = audioElement.currentTime;
currentTime.set(time);
const effectiveLyricTime = time - lyricTimelineOffsetMs / 1000;
lyricCurrentTime.set(effectiveLyricTime);
```

Upstream reads the element directly, every frame. Its `stores/motionSignals.ts` says why the value
is a module-level MotionValue and not store state:

> These are the values that change every frame while a song plays … They must never become reactive
> store state — writing `currentTime.get()` into a store would re-render the tree at frame rate.

Echora has the clock in the store, so it is capped at the store's write rate.

### Measured

`src/components/originalFoliaStageClock.test.tsx` mounts the real stage with a stubbed renderer,
drives a virtual 60 Hz frame loop and a 4 Hz host cadence, and reads `currentTime.get()` once per
frame — exactly what a runtime's ticker does:

| | frames in 1 s | **distinct positions published** |
|---|---:|---:|
| before (forwarding the prop) | 61 | **5** |
| after (extrapolating) | 61 | **>55** |

Negative control: reverting only the clock read reproduces `only 5 distinct positions across 61
frames`; reverting only the paused-sync effect reproduces `expected 42 to be 57.5` on a seek while
paused. Both fixes are pinned by a test that fails without them.

### Why only these modes looked broken

The other nine modes are driven mostly by the audio bands and by CSS/framer-motion, and the bands
*are* sampled fresh every frame (`sampleLocalAudioBands` reads the analyser inside the same loop).
So a band-driven stage keeps moving while its timeline stutters — and a timeline-driven stage
freezes. Tempera, Lumiere and Sonnet are the timeline-driven ones.

### The repo already knew this

`obs/protocol.ts` has the exact solution, for the overlay:

```ts
/**
 * Extrapolates the current playback position from a clock anchor … This is what makes a 5 Hz feed
 * drive a 60 fps stage.
 */
export const resolveObsStageTime = (clock, nowMs = Date.now()) => { ... }
```

with a test named *"extrapolates between clock messages — 5 Hz messages driving a 60 fps stage: the
position must move between them."* It was wired only to `ObsStage`, through the stage's optional
`timeProvider` prop. `LiveStage.tsx`'s own header comment even assumed the player path had it:

> it is fed by the landing audio engine's clock at a modest 10 Hz — **the stage interpolates between
> frames itself**

It did not. This change makes that sentence true.

## 2. The fix

`playback/stageClock.ts` — a small, pure, testable extrapolator with the same semantics the OBS
overlay already uses: advance with wall-clock time while playing, hold while paused, clamp to the
duration when known, scale by playback rate.

Two details that matter:

* **It re-anchors on the reported *position*, not on the render.** The player re-renders for many
  reasons between two `timeupdate` events while the position it reports is unchanged; anchoring on
  every render would restart the extrapolation and put the staircase straight back.
* **The extrapolation is capped** (`STAGE_CLOCK_MAX_EXTRAPOLATION_SEC = 0.75`, ≈3× the worst
  `timeupdate` gap, applied to wall-clock seconds before the rate). A healthy source never reaches
  it; a stalled one (buffering, hidden tab, a source that paused without telling us) freezes instead
  of drifting away from the audio.

The stage feeds it on every render and reads it in the frame loop, so **every host benefits** —
player, landing preview and OBS alike — and an explicit `timeProvider` still wins, which is what the
overlay uses.

Side effect worth having: the synthetic pulse used when no FFT is available
(`placeholderAudioBands`, i.e. YouTube iframe or CORS-tainted media) is a function of `time`, so it
was stepping at 4 Hz too. It is now smooth.

## 3. Verification

| | result |
|---|---|
| `pnpm --filter @echora/web test` | **73 files / 469 tests pass** (was 71 / 450; +19) |
| `pnpm --filter @echora/web exec tsc --noEmit` | clean |
| `node scripts/check-visualizer-types.mjs` | passed (0 unexpected, `src/types.ts` debt unchanged) |
| `pnpm --filter @echora/web lint` | **0 errors / 24 warnings** — the documented baseline |
| `pnpm --filter @echora/web build` | succeeds |
| `node scripts/check-bundle-size.mjs` | passed; `index` **325.0/335**, `sonnet-scene` 2335.9/2500, `stage-runtime` 173.3/200, `three-runtime` 875.6/950 — all unchanged |
| `pnpm --filter @echora/web bench` | sonnet program compile 22.62 ms median (budget 90 ms) |

New tests: `playback/stageClock.test.ts` (11 — per-frame movement, tracking accuracy, pause hold,
no re-anchor on a repeated value, extrapolation cap, duration clamp, negative seek, playback rate,
NaN sample, resume after pause), `components/originalFoliaStageClock.test.tsx` (5 — end to end
through the real stage), and 3 added to `original-folia-visualizers/tuningRegistry.test.ts`
(identity stability *and* non-staleness, plus one mode's defaults not leaking into another).

## 4. What was checked and ruled out

Because "the port is stale" was the obvious hypothesis — and was the right answer for Sonnet and
Diorama — it was tested rather than assumed:

* **The ported trees are current.** Every file under `tempera/` and `lumiere/` was diffed against
  upstream `master` at 0.7.15. Apart from attribution headers, the cn→tw comment conversion, the
  documented `LUMIERE_NEUTRAL_OFFSET` dead-expression removal, and the canvas-image-pool stub in
  `VisualizerTempera.tsx`, they are identical. Nothing upstream fixed in these two modes after the
  snapshot is missing here.
* **No WebGL rebuild or recompile per render.** A scratch probe mounted both real React shells with
  instrumented runtimes and replayed 12 host renders: `create` 1, `destroy` 0, `swapSong` 1,
  `compileTemperaProgram`/`compileLumiereProgram` 1. The mount-once host works as designed; the
  Sonnet-era teardown bug is not present here.
* **Defaults are identical.** `DEFAULT_TEMPERA_TUNING` and `DEFAULT_LUMIERE_TUNING` match upstream
  field for field, so nothing is running at a heavier quality by default.
* **The global frame-rate limiter is not throttling anything.** `utils/frameRateLimiter.ts` exists
  but Echora never installs it (upstream installs it in `src/index.tsx`), so rAF is native.
* **`pixiFilterPoolCompat` is a no-op here, correctly.** It is gated on pixi `8.21.0`; Echora
  resolves 8.19.0 (upstream is on ^8.21.0), so the bug it works around does not apply.
* **Shared helpers the modes depend on are not pre-fix copies.** `utils/lyrics/graphemeTiming`,
  `utils/fontStacks`, `utils/lyrics/renderHints`, `utils/colorExtractor`, `sonnet/sonnetLensFilter`,
  `sonnet/sonnetPrintFilters`, `pixiTextureBudget`, `runtime`, `pixiRuntimeHost`, `songHandover` and
  `VisualizerBackgroundRenderer` are identical to upstream. `colorMix` differs but is *faster* here
  (Echora added a parse/format memo). `utils/coverUrl` differs only in provider rules Echora does
  not have.

## 5. Not done here

1. **No on-device verification.** This sandbox has no browser (no chromium, and Playwright's browser
   CDN is unreachable), so everything above is module-level: the clock contract, the counts, the
   gates. The visible confirmation — tempera's block wipes and camera moves tracking smoothly,
   lumiere's beams sweeping — still needs a real device. `?stageProbe=1` plus
   `__echoraStageReport()` will show the frame cadence while you look.
2. **`currentLineIndex` still moves at the host's coarse rate.** It is a discrete line change and
   lines last seconds, so 4 Hz is enough for the shared subtitle overlay; upstream computes it in
   its rAF loop. Worth revisiting only if a mode starts hit-testing lines per frame.
3. **`pages/Player.tsx` subscribes to the whole player store** (`usePlayer()` with no selector), so
   every store write re-renders the entire player tree at `timeupdate` rate. That is now harmless for
   these two modes (finding #3 removed the last identity-churn consequence), but it is the reason a
   clock tick costs a full-tree render, and narrowing the subscription is the obvious next step.
4. **The Tempera canvas-image pool is wired to the UI but not to the renderer** (found while
   checking for churn; unrelated to performance, and not fixed here). `docs/tempera-image-pool.zh-TW.md`
   records the pool as finished, and the storage (`services/temperaLayerImages`) plus the whole pool
   UI are present and reachable — `tempera/TemperaSettingsPanel.tsx:13` imports
   `TemperaImageLayerControls`, so a user can import and place images. But
   `tempera/VisualizerTempera.tsx` still hands the runtime the stub
   (`const imageBlobs = EMPTY_TEMPERA_IMAGE_BLOBS`) with the comment that the pool "is deliberately
   NOT part of this port yet", and `loadTemperaLayerImageBlobs` has **no caller anywhere in `src/`**
   (only mentions in comments). Net effect: placing an image saves it and shows a thumbnail, and
   nothing ever appears on the stage. Restoring it is the ~20 lines upstream has at that spot — the
   `layerImageIds` effect — which the file's own comment describes.
5. **`components/visualizer/tempera/` duplicates six files** that also live in
   `original-folia-visualizers/tempera/` (same line counts, differing import paths). The panel uses
   the `original-folia-visualizers` copy, so the other tree is dead weight that will drift.
