# Echora vs Folia — measured gap and improvement plan

| | |
|---|---|
| **Date** | 2026-10-08 |
| **Echora baseline** | `arthurwang110505-debug/echora` @ `9d236d5`, branch `arena/9861a75c-echora` |
| **Upstream baseline** | `chthollyphile/folia-major` @ `43e7846d`, **v0.7.15** |
| **Method** | Every number below was measured in this session against both trees with the commands in [Appendix A](#appendix-a--reproducing-every-number). Nothing is quoted from existing docs — two of them are stale (see [§8](#8-corrections-to-existing-documentation)). |
| **Supersedes** | `docs/echora-gap-analysis.zh-TW.md` (baselined on v0.7.13) |

---

## Executive summary

1. **You do not have "30% of Folia".** Measured: your visualizer tree is **70,609 lines vs upstream's 70,594 — 100.0% parity, 13 of 14 modes**. What you have 18.3% of is the *product wrapped around* the stage (37,295 lines vs 203,697). The gap is services, sources, library, and engineering discipline — not rendering.
2. **"Really stuck" has two independent causes, and only one is fixed.** Commit `9d236d5` fixed the 4 Hz clock (Tempera / Lumiere / Sonnet). The second is a **Chromium glyph-cache fd leak** that upstream measured and fixed on 2026-09-26. It is still live in your **classic, partita, claddagh and cadenza**. Upstream's own measurement: 0.56–0.93 fd/s, renderer fd soft limit 1024, compositor stops producing frames. **You already ported this fix for `fume` — it was just never generalised.**
3. **Your largest asset is not type-checked.** `tsconfig.json` excludes `src/original-folia-visualizers`, `src/utils` and `src/types.ts`. Lifting the exclusions gave **175 errors across 74 files** at measurement time — but the arithmetic was encouraging: 89 disappeared with the dead-code deletion, 9 with `@types/three`, and 77 are unused-import noise. **One was a real, live bug** (a `ReferenceError` on sonnet's main scene-build path — found and fixed, see [§3.3](#33-what-wp1-actually-found)).
4. **13,995 lines (13.0% of `packages/web/src`) were unreachable** from the app entry — 95 files, verified by import-graph reachability including `import.meta.glob` roots and counting tests as consumers. Now a script in the repo: `node scripts/check-dead-code.mjs`. **77 of those files are now deleted**; 17 are deliberately kept.
5. **The plan is 6 work packages.** WP0 (the leak) and WP1 (delete dead code → lift type exclusions → put the existing gate in CI) are both small, both measurable, and together they remove the two things most likely to bite you next.

---

## Status — what has actually been done

This document started as a measurement. WP0 and most of WP1 have since been implemented, so the
numbers in §3 and §4 are **baselines**, not the current state. The section text is left as measured
so the reasoning is still auditable; this table is the live scoreboard.

| | Commit | Result |
|---|---|---|
| **WP0** — glyph-cache fd leak | `6f40c8d` | Fixed in classic / partita / claddagh / cadenza. One shared switch (`visualizer_glow_blur_quantize`, on by default on Linux, user-toggleable in Settings), one shared `wordGlowVariants`, fume now delegates to it instead of keeping the rule private. 33 new tests. **Not yet confirmed on a real device** — the sandbox has no browser, so this rests on source parity with upstream's published measurements. |
| **WP1a** — delete unreachable code | `aafd5c5` | **77 files / 10,182 lines deleted.** Dead code 94 files / 13,993 L (12.9% of src) → **17 files / 3,811 L (3.9%)**. Product files 509 → 432, reachable 415. |
| **WP1b** — the bug it uncovered | `c5bfdef` | `sonnetTextViewBuilder.ts` re-exported `measureText` instead of importing it, so the call site 140 lines later was an unresolved identifier. A `ReferenceError` on the **main, non-staff path of every sonnet scene build**, swallowed by `SceneErrorBoundary`. Only visible because the file sat under an excluded path. |
| **WP1c** — type packages | `d030656` | `@types/three@^0.185.4` + `@types/react-window@^1.8.8`. Type debt with exclusions lifted: **175 → 97 → 89 errors**. The diorama tree (6,742 lines of Three.js) is no longer `any`. |
| **WP1d** — burn down the rest | *not started* | 89 errors remain: 77 `TS6133` (mechanical), 12 across 5 files. Then lift the `tsconfig.json` exclusions and put `scripts/check-visualizer-types.mjs` in CI. |
| **WP2–WP4** | *not started* | Observability, stage prop contract, shipping the already-written features. |
| **WP5** | **out of scope** | Dropped at the author's request — not part of the intended feature set. |

Two clusters were **deliberately not touched**, by decision rather than oversight:

- **The VisPlayground dev-tool cluster** (6 files / 2,835 lines) — left in place and still covered by
  the `tsconfig` exclude. It has its own problem, recorded in [§3.3](#33-what-wp1-actually-found).
- **11 never-wired feature modules** (~930 lines) plus `utils/appPlaybackGuards.ts`, which two of
  them import. These are the raw material for WP4.

---

## 1. The headline reframe

| Measured | Echora | Upstream v0.7.15 | Parity |
|---|---:|---:|---:|
| All TS/TSX | 616 files / 111,828 lines | 2,190 files / 388,469 lines | 29% |
| Product source tree | 578 files / **107,904** lines (`packages/web/src`) | 1,475 files / **274,291** lines (`src`) | 39% |
| **Visualizer tree** | **70,609 lines / 13 modes** | **70,594 lines / 14 modes** | **100.0%** |
| ⇒ Everything *around* the stage | **37,295 lines** | **203,697 lines** | **18.3%** |
| Service files | **7** | **155** | 4.5% |
| Component files | 56 | 758 | 7% |
| Stores | 8 | 41 | 20% |
| Local-library code | **15 files / 1,557 lines** (11 of them unreachable) | **279 files / 55,890 lines** (incl. a top-level `src/library/`: 202 files / 30,776 lines) | 2.8% |
| Test files | 76 | 547 (+53 e2e specs) | 13% |
| e2e specs | 3 | 53 | 6% |
| CI workflows | 1 | 9 | 11% |
| Runtime deps | 49 | 68 (33 absent here) | 72% |
| Locales | `en`, `zh-TW` | `en`, `in`, `zh-CN` | — |

*Metric note:* the file counts above are non-test `.ts`/`.tsx` files counted **recursively**, which is why "Service files" reads 7 rather than the 10 you get from `ls src/services` (that counts subdirectories as one entry). Upstream's `services/` has 10 subdirectories — `audioEffects`, `automix`, `debug`, `lyricExport`, `obs`, `onlineMusic`, `playbackRecovery`, `ponder`, `repositories`, `sync` — of which Echora has an equivalent for **exactly one** (`obs`, and it lives at `src/obs/`, not under `services/`). Your entire `services/` directory is 7 files: `agnesAi`, `imageAssetCache`, `lyricSegmentationAi`, `temperaImageArchive`, `temperaImageArchiveFormat`, `temperaLayerImages`, `visualizerImageAsset` — five of which serve the Tempera image pool that §5 shows never reaches the renderer.

Per-mode line counts (upstream → Echora) confirm the port is essentially complete and in several cases *larger* than upstream:

```
cadenza  1783 → 1776     lumiere  11536 → 12032     sonnet  11165 → 11585
cappella 1983 → 1983     monet     3740 →  3223     tempera 11426 → 11799
claddagh 1114 → 1144     partita    982 →  1068     tilt      727 →   727
classic   690 →  813     pendolo   2398 →  2237     still     115 → MISSING
diorama  6677 → 6742     fume      3660 →  3729     videoLayer  → MISSING
```

**Read this as: the porting project is done. The product project is not started.** Every recommendation below follows from that.

---

## 2. Difference #1 — a second stall cause, still live (WP0)

### 2.1 What upstream found

Upstream commit `6f156283` (2026-09-26), *"fix(visualizer): 修复 Linux 下长时间播放后歌词动画卡死"*, plus `79acac15` for fume. Written up in `docs/linux-glyph-cache-fd-leak.md` (92 lines, with measurements). Mechanism, in their words:

> Chromium (GPU rasterization) caches glyphs per **strike**; the strike key includes font, size, device scale and the **mask filter** — a blurred shadow *is* a mask filter, its sigma measured in device space. Each new strike takes a discardable handle in the renderer, allocated in **4 KiB shared-memory chunks that are never returned**. So any animation that produces a new combination per frame — a changing blur radius, or a changing device font size — mints strikes without end, roughly **one extra fd per ~1,000 new combinations**.

Observed symptom: after **30–40 minutes** of playback on Linux the lyric animation freezes and the picture stops updating **while audio continues**. All leaked fds are `/dev/shm/.org.chromium.Chromium.*`, growing at **0.4–0.9 fd/s**; the renderer's fd soft limit is **1024**, and when it is exhausted shared-memory allocation fails and **the compositor stops producing frames**. Windows/macOS leak too, just without such a low ceiling — "a few MB a day". Upgrading Electron 44.4.5 or Chromium 152 does not help; it is Chromium behaviour.

### 2.2 Where Echora stands, mode by mode

Upstream's measured leak rate (renderer fd/s, monet background, 120 fps, 180 s per mode) against what I found in your tree:

| Mode | Upstream fd/s (fix off) | Upstream fd/s (fix on) | **Echora today** | Evidence |
|---|---:|---:|---|---|
| classic | 0.835 / 0.925 | −0.003 | 🔴 **LEAKING** | `classic/Visualizer.tsx:583,661` — framer-motion interpolates `textShadow: "none"` → radii at `:589,605,632,647` |
| partita | 0.802 | −0.009 | 🔴 **LEAKING** | `partita/VisualizerPartita.tsx:834,915` — same `textShadow: 'none'` pattern |
| claddagh | 0.558 | −0.003 | 🔴 **LEAKING** | `claddagh/VisualizerCladdagh.tsx:719,722` — per-word `textShadow` from `currentGlowRadius.toFixed(1)` **plus** a per-frame `scale()` in the transform at `:659` |
| cadenza | 0.129 / 0.111 | 0.002 | 🔴 **LEAKING** | no `willChange` anywhere in `cadenza/VisualizerCadenza.tsx`; upstream sets it at `:1611-1612` gated on `isGlowBlurQuantized()` |
| fume | 0.575 / 0.609 | −0.001 | 🟢 **FIXED** | you ported it yourself: `fume/fumeCanvasGlow.ts` (`isLinuxFumeRenderer`, `quantizeFumeCanvasBlur`, `setFumeCanvasTextGlow`, `fillFumeGlowText`) + `fume/fumeLiveRaster.ts`, both with tests |

Missing shared modules, all of them:

| Symbol / file | Upstream | Echora |
|---|---|---|
| `utils/glowBlurQuantize.ts` (the switch, `isGlowBlurQuantized()`, `quantizeShadowBlur`, `setCanvasTextGlow`, storage key `visualizer_glow_blur_quantize`) | present | **absent** — 0 occurrences |
| `visualizer/wordGlow.ts` (156 lines; classic + partita `wordGlowVariants`) | present | **absent** — 0 occurrences |
| Lab toggle "Fix lyric animation freeze on Linux" | present | **absent** |
| Memory monitor (plots renderer/GPU fd counts — *how they found this*) | `components/app/overlays/*` | **absent** |

### 2.3 Why this is the top of the list

- **It matches the reported symptom.** "Really stuck" with audio still playing is precisely the freeze signature. The clock bug fixed in `9d236d5` makes animation *judder from the first frame*; this one makes it *run fine and then stop* — two different complaints, and you may well have been seeing both.
- **The fix already exists in your own codebase.** `fumeCanvasGlow.ts` is a competent, tested, Linux-gated implementation of exactly this idea. This is a generalisation job, not a research job.
- **It is cheap and it is measurable.** ~350 lines to port (`glowBlurQuantize.ts` ~100, `wordGlow.ts` 156, plus small edits in claddagh and cadenza), and upstream has already published the before/after numbers to check against.
- **Note the honest caveat:** upstream found rounding the radius does *not* fix claddagh — "the words' raster scales are all different, so a bounded set of CSS radii is still an unbounded set of device sigmas (measured: −70%, not −100%)". Claddagh must move to a `drop-shadow() blur()` filter chain, not to quantisation.

**Do this first.** Details in [WP0](#wp0--finish-the-stall-work-12-weeks-highest-value).

---

## 3. Difference #2 — your biggest asset is not type-checked

`packages/web/tsconfig.json` excludes three paths:

```
src/original-folia-visualizers   ← 70,609 lines, the whole stage engine
src/utils                        ← 112 files / 14,370 lines
src/types.ts                     ← 1,344 lines
```

Exclusions in `tsconfig` are **transitive**: a file only reached *through* an excluded folder is not checked either. So `pnpm build` (which runs `tsc`) type-checks roughly **37,000 of your 107,904 lines**. CI runs `lint`, `test`, `build`, `bundle-size` — never the visualizer gate.

A partial gate exists and works: `tsconfig.visualizers.json` + `scripts/check-visualizer-types.mjs` covers the A-layer plus `tempera/**` and `lumiere/**`, and **passes today** (0 unexpected errors). It is not in CI, and it leaves **11 of 13 modes ungated** — all of diorama, sonnet, cadenza, cappella, claddagh, classic, fume, monet, partita, pendolo, tilt, and all backgrounds.

### 3.1 What lifting the exclusions actually shows

`tsconfig` with `include: ["src"]`, `exclude: []` → **175 errors across 74 files**. Cross-referenced against the reachability analysis in §4:

| | Files | Errors | What it means |
|---|---:|---:|---|
| In **dead** code | 27 | 89 | Vanishes when you delete §4. No work. |
| In **live** code | **47** | **86** | Real debt. 43 of the 47 files are in the visualizer tree. |

Live errors by code:

| Code | Count | Verdict |
|---|---:|---|
| `TS6133` unused declaration | 72 | Mechanical. `noUnusedLocals` noise — e.g. `'React' is declared but its value is never read` in **17** `entry.tsx` files. Delete the imports. |
| `TS7016` no declaration file | 7 | **Install `@types/three`.** Upstream pins `@types/three ^0.185.4` against the same `three ^0.185.1` you have; you have no types package at all. Right now **all 6,742 lines of diorama's Three.js are `any`.** |
| `TS2339` property does not exist | 2 | `DioramaScene.tsx:946,947` — `.aspect` / `.fov` on `Camera`. Consequence of the missing `@types/three`; needs `PerspectiveCamera`. |
| `TS2352` / `TS2304` / `TS2307` | 4 | Small, local. |
| **`TS2345` registry contract** | **1** | **A real bug.** `sonnet/entry.tsx:11` — *"Property `render` is missing in type … but required in type `VisualizerRegistryEntry`."* Sonnet registers without the field the registry's own type demands. It works at runtime only because `OriginalFoliaVisualizerStage.tsx` resolves components via `import.meta.glob('../*/Visualizer*.tsx')` instead of `entry.render` — i.e. the registry contract and the stage's actual lookup mechanism have drifted apart. |

### 3.2 The arithmetic is the good news

As predicted at measurement time:

```
175 errors
 −89   delete the 95 unreachable files (§4)
  −7   pnpm add -D @types/three@^0.185.4
  −72  remove unused imports (one lint --fix pass)
─────
  ~7   genuine issues, of which 2 are one diorama camera cast and 1 is the sonnet registry contract
```

What actually happened, measured after each step rather than predicted:

```
175 errors / 74 files   baseline
 −77  →  98 / 50        WP1a: deleted 77 of the 95 (17 kept by decision; 1 was a false positive)
  -1  →  97 / 50        WP1b: the sonnet measureText ReferenceError, fixed
  -8  →  89 / 45        WP1c: @types/three (7 TS7016 + 2 TS2339) and @types/react-window (1 TS7016,
                            replaced by 2 more precise TS2305 — see §3.3)
─────
  89 errors remain, and not one of them is in dead code any more.
```

The prediction was close but optimistic in one place: `@types/three` cleared **9**, not 7, because
the two `DioramaScene.tsx:946,947` `TS2339` errors were the untyped import widening
`PerspectiveCamera` to `Camera` rather than separate defects. It was pessimistic in another: the
remaining `TS6133` count is **77**, not 72, because deleting the dead files exposed unused
declarations in the live files that had been importing them.

The conclusion holds. You were never sitting on 175 errors of debt — you were sitting on a handful,
hidden behind noise that mechanical operations remove. That is why
[WP1](#wp1--make-the-type-gate-real-12-weeks) was worth doing before any feature work: it converts
"we can't type-check the stage" into "the stage is type-checked and CI enforces it".

### 3.3 What WP1 actually found

The point of lifting the exclusions was never the error count. It was that **two of the errors were
live defects that no test, no lint pass and no build had ever reported**, because every gate in the
repo skips these paths.

**1. `sonnetTextViewBuilder.ts` — a `ReferenceError` on sonnet's main path** (fixed in `c5bfdef`).

The file re-exported the shared measuring memo:

```ts
export { measureText } from './sonnetTypographyLayout';
```

A re-export does **not** put the name in scope in its own module. Eight lines of comment above it
explain that the glyph builder measures "through the shared memo" — and then `buildSonnetTextView`
calls it:

```ts
char => measureText(char, fontSpec, fontSize),
```

That identifier was unresolved. `buildSonnetTextView` is called from `sonnetSceneBuilder.ts:230`, on
the main non-staff path, so the callback threw the first time the glyph layout measured a character.
`SceneErrorBoundary` swallowed it, which is why the symptom was a sonnet stage that quietly fell back
rather than an error anyone saw. TypeScript had been reporting it all along as
`TS2304: Cannot find name 'measureText'`.

**2. `VisPlayground.tsx` — written against a dependency version the repo does not have** (recorded,
not fixed: the cluster is deliberately being left alone).

Installing `@types/react-window@^1.8.8` to match the pinned `react-window@^1.8.11` traded one vague
error for two precise ones:

```
VisPlayground.tsx(5,10): Module '"react-window"' has no exported member 'List'.
VisPlayground.tsx(5,16): Module '"react-window"' has no exported member 'useListRef'.
```

`List` and `useListRef` are the react-window **v2** API. Verified at runtime rather than from the
types — `require('react-window').List === undefined`; v1.8.11 exports exactly `FixedSizeGrid`,
`FixedSizeList`, `VariableSizeGrid`, `VariableSizeList`, `areEqual`, `shouldComponentUpdate`.
`VisPlayground.tsx` is the only consumer of the package in the entire tree, so the fix is one of two
one-line changes: pin `react-window@^2`, or import `FixedSizeList`. It is unreachable dev tooling, so
nobody is hitting this today — but it is the strongest argument yet for resolving that cluster's
delete-vs-wire question rather than leaving it indefinitely.

**What remains, all in live code:**

| Code | Count | Where | Verdict |
|---|---:|---|---|
| `TS6133` unused declaration | 77 | spread across ~45 files, incl. `'React' unused` in 17 `entry.tsx` | Mechanical. This is the whole of WP1d. |
| `TS2339` / `TS2307` | 4 / 2 | `utils/appPlaybackGuards.ts`, `utils/lyrics/types.ts` | Both `TS2307` are an import of `../../types/navidrome`, **a module that has never existed in this repo** — it belongs to WP5, which is out of scope. The 4 `TS2339` are downstream of it (the type resolves to `never`). Pre-existing, not caused by the deletion. |
| `TS2352` | 2 | `stageProbe.test.ts:99,105` | A `globalThis` cast style. Local. |
| `TS2345` registry contract | 1 | `sonnet/entry.tsx:11` | Still open — see the table in §3.1. The registry's own type demands a `render` field sonnet does not supply. |
| `TS2322` | 1 | `VisPlaygroundSettingsPanel.tsx` | Inside the cluster being left alone. |
| `TS2305` | 2 | `VisPlayground.tsx` | The react-window v1/v2 mismatch above. |

One structural note worth acting on separately: **`three` is declared as a `devDependency`** while
being bundled into a runtime chunk (`vite.config.ts:133` carves out `three-runtime`, budgeted at
950 kB and currently 875.6 kB). It builds today because CI installs dev dependencies, but any
`--prod` install would produce a broken bundle. That is a one-line move to `dependencies`.

---

## 4. Difference #3 — 13,995 unreachable lines

**This is now a script in the repo:** `node scripts/check-dead-code.mjs` (`--list` for every path, `--budget N` to ratchet). It reports exactly the numbers below.

Method: build the import graph over `packages/web/src` (static `import`, `export … from`, dynamic `import()` — which catches every `lazyWithRetry(() => import('./pages/X'))` route in `App.tsx`), then walk it from the **real** roots:

- `src/main.tsx` (from `index.html:175`), `src/vite-env.d.ts`, `src/i18n/testSetup.ts` (from `vitest.config.ts:18`), `src/components/OriginalVisualizerRendererProxy.js`
- every `*.test.ts(x)` file — **tests count as consumers**, so this number is conservative
- the 49 files that only `import.meta.glob` can see: `*/entry.tsx`, `*/tuning.ts`, `backgrounds/*/entry.tsx`, `*/Visualizer*.tsx`, `*/create*PixiRuntime.ts`

**Result: 412 of 507 product files are reachable. 95 files / 13,995 lines — 13.0% of the 107,904 lines in `packages/web/src` — are not.**

| Area | Lines | Files | What it is |
|---|---:|---:|---|
| `utils/` | 5,682 | 45 | Superseded helpers + never-wired features |
| `original-folia-visualizers/` | 2,835 | 6 | The whole **VisPlayground** dev-tool cluster |
| `utils/lyrics/` | 2,380 | 23 | A second, unused lyric-matching stack |
| `components/visualizer/tempera/` | 1,361 | 6 | **Duplicate** of `original-folia-visualizers/tempera/` |
| `utils/lyrics/providers/` | 1,155 | 5 | KuGou / AMLL / KRC providers never registered |
| `components/` | 225 | 2 | `FoliaLyricStage.tsx` + a stale `.d.ts` |
| `components/landing/` | 207 | 3 | `Reveal`, `StagePreviewTransport`, `TiltCard` |
| `utils/lyrics/adapters/` | 150 | 5 | Adapter classes with no factory caller |
| **Total** | **13,995** | **95** | |

Verified clusters (each checked by direct grep, not just by the graph). Line counts are `wc -l`.

### 4.1 What was deleted, and what was not

Commit `aafd5c5` removed **77 files / 10,182 lines**. Re-running the script afterwards: **432 product
files, 415 reachable, 17 unreachable / 3,811 lines — 3.9% of src, down from 12.9%.**
`components/visualizer/` no longer exists; `utils/lyrics/` retains only its 10 live modules
(`activeLine`, `alternateText`, `cjkSemanticLayout`, `formatDetection`, `graphemeTiming`,
`parserCore`, `renderHints`, `sentenceLayout`, `ttmlConversion`, `types`).

Two corrections were made to this section's list during execution, and both matter more than the
line count:

1. **`components/OriginalVisualizerRendererProxy.d.ts` was a false positive** — the "stale `.d.ts`" in
   the `components/` row above. Nothing imports it by path, so the reachability walk could not see
   it, but TypeScript resolves it by adjacency to the rooted `.js` proxy that the live
   `OriginalFoliaVisualizerStage.tsx:16` imports, and `originalFoliaStageClock.test.tsx:30` mocks.
   Deleting it would have broken the build. The script now roots it explicitly rather than carrying a
   "do not delete" warning in a header comment — the warning was on the delete list anyway. **The
   true dead count is 94, not 95.**
2. **`utils/appPlaybackGuards.ts` had to be added as a keeper.** Taking the transitive closure of the
   keepers over the dead set showed that `utils/queueAddBehavior.ts` and
   `utils/songThemeAutoGeneration.ts` — both kept for WP4 — import it. A reachability walk reports
   individual files; deleting them needs the closure.

The 17 survivors are all deliberate:

| Group | Files | Why kept |
|---|---:|---|
| VisPlayground dev-tool cluster | 6 | Decision still open — delete vs. wire behind a dev route. Untouched this round. |
| Never-wired WP4 features | 10 | `frameRateLimiter`, `audioEqualizer`, `replayGain`, `lyricOffsetMemory`, `queueAddBehavior`, `songThemeAutoGeneration`, `chorusDetector`, `chorusEffects`, `chorusResolver`, `fontAvailability`. Already written; WP4 connects them. |
| Transitive dependency | 1 | `appPlaybackGuards.ts`, imported by two of the above. |

**A limitation of the method, learned the hard way.** An import-graph walk cannot see
**string-path references**. `components/player/stageVolumeGuard.test.ts` reads the source of each
stage surface with `readFileSync` to assert no volume widget leaked in, and it listed
`components/FoliaLyricStage.tsx` — so deleting that file broke the test with a bare `ENOENT`, which
no amount of graph analysis would have predicted. The same blind spot covers
`new Worker(new URL('../workers/x.worker.ts', import.meta.url))` and Vite's `?raw` / `?url` imports.
Before deleting, grep the basenames against the config files and against any test using
`readFileSync` / `readdirSync` / `globSync`. In this repo that check found exactly one coupling, and
also confirmed that no `*.worker.ts` file exists at all — the single `new Worker(new URL(...))` in
the tree pointed at a path that was already dangling inside dead code.

Gates after the deletion: main `tsc` clean, visualizer type gate passed, tests **75 files / 502
all passing**, lint 0 errors / 24 warnings, build ok, and all four bundle budgets unchanged. Type
debt with the exclusions lifted went 175 → 98, and the errors sitting in dead code went **89 → 0**.

- **VisPlayground — 2,835 lines.** `VisPlayground.tsx` (1,440), `VisPlaygroundSettingsPanel.tsx` (932), `PreviewPlaceholder.ts` (205), `VisPlaygroundPreviewHotspots.tsx` (107), `useVisPlaygroundPreviewPlayback.ts` (88), `FontFallbackStackControl.tsx` (63). No route, no import — the only hits for the name are inside *comments* in Lumiere/Tempera. This is a dev tool that was ported and then bypassed by `OriginalFoliaTuningPanel`. **Decide: wire it behind a dev flag, or delete it.** Note your own stale gap-analysis already flagged "把 12 個模式的死設定面板做個了斷" — this is that item, and it is bigger than it looked.
- **`components/visualizer/tempera/` — 1,361 lines.** A duplicate of the canonical `original-folia-visualizers/tempera/` tree. The tuning panel imports the canonical one; nothing imports this copy. Pure deletion — *but see §5 first*: this is also the pool UI the Tempera image feature needs, so decide whether to wire it or rewrite it before you delete it.
- **Appearance codec + old OBS helpers — 8 files / 1,892 lines.** `appearanceCodec.ts` (550), `appearanceImportPlan.ts` (481), `obsCustomCss.ts` (360), `obsBrowserSource.ts` (199), `obsWebAppearance.ts` (166), `currentObsUrl.ts` (56), `webObsTarget.ts` (39), `obsUrl.ts`. Superseded by `src/obs/`. **This cluster is why the reachability walk matters:** `appearanceCodec.ts` has two importers, so a naive "who imports this file" check reports it as live — but both importers are themselves unreachable, so the whole thing is transitively dead. (`utils/playerCapWebSource.ts` is *not* dead — don't delete it.)
- **A second lyric stack — 3,685 lines** (`utils/lyrics/` 2,380 + `providers/` 1,155 + `adapters/` 150): `autoMatchBestLyric.ts` (529), `kugouLyricProvider.ts` (376), `navidromeStructuredLyrics.ts` (246), `matchScore.ts` (218), `lyricMatchSources.ts` (166), `amllDbProvider.ts` (100)… The live app uses `services/` instead. **Careful here:** `amllDbProvider.ts` looks like a live lyric provider and is not — it is unreachable. But before deleting, confirm none of these are intended for [WP5](#wp5--the-real-product-gaps-decide-scope-first); the Navidrome ones in particular are the cheapest door into that work.
- **Features written and never wired — 12 files / 1,089 lines.** These are the interesting ones, because they are *paid-for functionality sitting on the shelf*: `frameRateLimiter.ts` (196 — referenced only from a Lumiere **comment**), `foliaIgnore.ts` (136), `audioEqualizer.ts` (119), `appNavidromeLyrics.ts` (96), `lyricOffsetMemory.ts` (95), `chorusEffects.ts` (94), `queueAddBehavior.ts` (83), `chorusResolver.ts` (65), `fontAvailability.ts` (55), `replayGain.ts` (52), `chorusDetector.ts` (51), `songThemeAutoGeneration.ts` (47). See [WP4](#wp4--ship-the-features-you-already-wrote-12-weeks).
- **Local-library helpers — 11 files / 576 lines** (`localLibraryIndex`, `localLibraryNames`, `localLibraryResolver`, `localMetadataWorkerClient`, `localSongCover`, `localSongMetadata`, `localSongSorting`, `localSongMatchContext`, `LocalFileLyricAdapter`, `types/localCover`, `types/localLibrary`). The only head start you have on §5's biggest gap, and all of it unreachable.

**One known false positive:** `components/OriginalVisualizerRendererProxy.d.ts` (3 lines) is reported because nothing imports it by path — TypeScript picks it up by adjacency to the rooted `.js` proxy. **Do not delete it.** The script's header documents this.


---

## 5. Difference #4 — the product around the stage

This is the 18.3%. Concretely:

**Music sources.** Upstream `services/onlineMusic/` is 27 files: NetEase (`neteaseProvider`), QQ (`qqProvider` + `qqNormalize` + `qqPlaylistDiagnostics`), KuGou (`kugouProvider`/`kugouTransport`), Bodian (5 files), all behind a `providerRegistry` + `providerStorage` + `providerAccountCache`, plus `resourceCache`, `songAvailability`, `songMetadata`, `playbackReportGate`, and login diagnostics. Echora: Spotify, YouTube Music, local — and a 7-file `services/` directory (§1). You *have* KuGou and AMLL lyric providers written (§4) but unregistered and unreachable.

**Local library — the biggest single gap.** Upstream has an entire subsystem: a top-level `src/library/` of **202 files / 30,776 lines** organised as `app/` (ports + controllers: account, directory-batch, home, mutation, playback), `core/{bindings, contracts, model, services, state}`, and `suites/{grid, tui}` — 30,776 lines behind a suite switch. Counting everything local/library-related across the tree: **279 files / 55,890 lines**. Navidrome is integrated *inside* it (15 files: scrobble reporter, home model, collection resources/tracks, home-library service + deps, section store).

Echora has **15 files / 1,557 lines**, and **11 of the 15 are unreachable** (§4) — `localLibraryIndex`, `localLibraryNames`, `localLibraryResolver`, `localMetadataWorkerClient`, `localSongCover`, `localSongMetadata`, `localSongSorting`, `localSongMatchContext`, `LocalFileLyricAdapter`, plus `types/localCover` and `types/localLibrary`. Only four are live: `playback/localAudioAnalyser.ts`, `store/localDemoSongs.ts`, and those two type files. That is a **36× gap**, and for a PWA it is where a self-hosted user actually lives.

**Absent deps that are web-feasible:** `dexie` + `fake-indexeddb` (IndexedDB persistence — the local library needs these), `music-metadata` + `file-type` (tag reading in-browser), `i18next-browser-languagedetector`, `pinyin-pro`, `@google/genai`, `animejs`.

**Missing modes:** only `still` (115 lines — trivial) and `videoLayer`.

**Locales:** you have `en` + `zh-TW`; upstream has `en` + `in` + `zh-CN`. Given your audience, **`zh-CN` is a bigger gap for you than it is for upstream** — you currently ship Traditional only.

**Stage prop-contract drift** (from the turn-1 work, still open): `OriginalFoliaVisualizerStage.tsx` omits `staticMode`, `isDaylight`, `backgroundStaticMode`, `subtitleOverlay*`, `harmonySubtitle*`, `isPreviewMode`, `onBack`, `isPanelOpen`, and hardcodes `lyricsFontScale` / `subtitleFontScale` / `visualizerOpacity` to `1` with `showText` always true. Those settings exist in your UI and silently do nothing on the ported stage. This is the same class of bug as the sonnet `render` contract in §3.1: **the registry type and the stage's real behaviour have drifted.**

**Tempera image pool.** `services/temperaLayerImages.ts` stores user artwork in IndexedDB and exports `loadTemperaLayerImageBlobs` (`:112`) — which has **no caller anywhere in the repo**. `tempera/VisualizerTempera.tsx:150` hardcodes `const imageBlobs = EMPTY_TEMPERA_IMAGE_BLOBS`. Upstream, at the same spot, does `useState<Map<string,Blob>>` → `loadTemperaLayerImageBlobs(placements)` → `setImageBlobs(blobs)`, and keys the rebuild on `imageBlobs`. This one is **documented and deliberate** — your own comment at `:141-149` says so, and correctly notes that the scene builder, tuning and runtime all still support a populated pool, so finishing it is "porting the storage plus the pool UI and handing the blobs in here again". The storage is already written. What's missing is ~20 lines in `VisualizerTempera.tsx` plus the pool UI — which is the dead duplicate tree in §4. **So: delete the duplicate, wire the canonical one, and this feature ships.**

---

## 6. Difference #5 — tests, CI and observability

| | Echora | Upstream |
|---|---:|---:|
| Test files | **76** (72 `packages/web/src`, 3 `packages/core/src`, 1 vite-plugin) | **547**, all under a top-level `test/` with `component/ fixtures/ helpers/ manual/ ui/ unit/` |
| e2e specs | **3** | **53** |
| Test:source ratio | 12.5% | 37% |
| CI workflows | **1** (`ci.yml`: lint, test, build, bundle budget, playwright e2e) | **9** |
| Perf/memory telemetry | **none** | Memory monitor plotting renderer/GPU fd counts |

Two structural observations, not just a count:

- **Upstream separates tests from source** (`test/` with `helpers/` and `fixtures/`), which is how it sustains 547 files. You co-locate, which is fine at 76 and gets expensive at 500. If you intend to grow coverage, decide the layout *before* you grow it.
- **The observability gap is why the leak survived.** Upstream found a 0.9 fd/s leak because they had a screen that plotted fd counts. You have no equivalent, so the same class of bug is only discoverable by a user complaining "it's stuck" — which is exactly what happened. `utils/stageProbe.ts` exists and is live, but there is no probe harness, no on-screen readout, and nothing in CI. This is [WP2](#wp2--observability-so-the-next-stall-takes-minutes-not-weeks-1-week), and it is the cheapest insurance in this document.

---

## 7. The plan

Ordered by *(risk removed × value) ÷ effort*. WP0 and WP1 are the ones to do before anything else; WP2 is small and should ride along with WP0. WP5 is a scope decision, not a task.

---

### WP0 — Finish the stall work (1–2 weeks, highest value)

**What**

1. Port `utils/glowBlurQuantize.ts` from upstream — the shared switch (`isGlowBlurQuantized()`, storage key `visualizer_glow_blur_quantize`, Linux-on-by-default), `quantizeShadowBlur`, `setCanvasTextGlow`. You already wrote the fume-local equivalent; this lifts it to a shared module. Refactor `fumeCanvasGlow.ts` to delegate to it so there is one switch, not two.
2. Port `wordGlow.ts` (156 lines) and switch **classic** and **partita** to `wordGlowVariants`. Mind upstream's warning: the `passed` variant must explicitly keep `color`, or framer resets it to `initial`'s transparent and a transparent glyph casts no shadow.
3. Fix **claddagh** with a `drop-shadow(...) blur()` filter chain — *not* quantisation (upstream measured quantisation at only −70% here). Single layer: text-shadow radius × 0.5. Chorus three layers: × 0.4, middle alpha × 0.2.
4. Fix **cadenza**: `will-change: transform` on the overlay words' outer element, gated on the switch (upstream `VisualizerCadenza.tsx:1611-1612`).
5. `pnpm add -D @types/three@^0.185.4` — 7 errors gone, and diorama's 6,742 lines stop being `any`. Fix the two `Camera` → `PerspectiveCamera` casts at `DioramaScene.tsx:946,947`.
6. Fix `sonnet/entry.tsx` — either add `render`, or make `VisualizerRegistryEntry.render` optional and document that the stage resolves via glob. Pick one; the current state is a contract that lies.

**Why** — it is the reported symptom; the fix exists in your own tree; upstream published the target numbers.

**How to verify**
- Reproduce upstream's measurement: fd/s per mode over 180 s. Target ≈ 0 for classic, partita, claddagh, cadenza (upstream: −0.003, −0.009, −0.003, 0.002).
- Add the Lab toggle and confirm the *off* path is pixel-identical to today.
- Add a `wordGlow.test.ts` asserting the drop-shadow radii match upstream's fitted constants (0.4 scale, 0.7 inner alpha).
- Keep the existing gates green: `pnpm test` (73 files / 469 tests), `node scripts/check-visualizer-types.mjs`, bundle budgets (`index` 325.0/335, `sonnet-scene` 2335.9/2500, `stage-runtime` 173.3/200, `three-runtime` 875.6/950).

**Risk** — visual regression in the glow. Mitigate exactly as upstream did: gate on the switch, fit radii by pixel difference, default on only for Linux.

---

### WP1 — Make the type gate real (1–2 weeks)

**What**

1. **Delete the 95 unreachable files (13,995 lines)** from §4, in this order — each step is independently revertable:
   a. `components/visualizer/tempera/` duplicate (1,361) — *after* WP0/WP4 confirm the canonical tree is the one you keep.
   b. VisPlayground cluster (2,835) — or move it behind a dev-only route; decide, don't drift.
   c. appearance codec + old OBS helpers (1,892).
   d. the second lyric stack (3,685) — **only after** the WP5 scope decision, since some of it may be wanted.
   e. remaining `utils/` orphans.
2. **Lift the `tsconfig.json` exclusions** one path at a time: `src/types.ts` → `src/utils` → `src/original-folia-visualizers`. After step 1 and WP0's `@types/three`, the residual is ~72 `TS6133` + ~6 real.
3. Clear `TS6133` mechanically (`eslint --fix` with `no-unused-vars`, or `tsc` output as a worklist).
4. **Widen `tsconfig.visualizers.json`** from tempera+lumiere to all 13 modes, then **delete it** once the main tsconfig covers the tree — two overlapping type configs is how the blind spot happened.
5. **Add the gate to CI.** Today `ci.yml` runs lint / test / build / bundle-size / e2e and never runs `node scripts/check-visualizer-types.mjs`. Once step 2 lands, plain `pnpm build` covers it; until then, add the job.

**Why** — 65% of your source is not type-checked, and the reason it "can't be" is 89 errors that delete themselves plus 72 that a lint pass removes. After this, a sonnet-contract drift (§3.1) or a stage-prop drift (§5) fails CI instead of shipping.

**How to verify** — `tsc --noEmit` clean over all of `src`; CI red on a deliberately introduced error in `diorama/`; `git diff --stat` showing ~14k deletions and no behaviour change (`pnpm test` still 469 passing, bundle sizes unchanged or smaller).

---

### WP2 — Observability, so the next stall takes minutes not weeks (1 week)

**What**

1. Port upstream's **memory monitor** (`components/app/overlays/*`): renderer/GPU fd count, JS heap, and a per-mode frame-time sparkline, behind a Debug menu.
2. Generalise the live `utils/stageProbe.ts` into a small **probe harness**: N frames, distinct clock positions, create/destroy/swap/compile counts, frame-time percentiles. The turn-1 investigation had to hand-roll this as a throwaway test (`originalFoliaStageClock.test.tsx`); make it a first-class tool.
3. Add a **CI perf job** running the harness headlessly with a regression budget, alongside the existing bundle budget and `bench` (22.62 ms today).
4. Write the **animation guardrails** from upstream's `linux-glyph-cache-fd-leak.md` §5 into `CONTRIBUTING.md`: never animate a text-shadow or canvas `shadowBlur` radius per frame; use `filter: drop-shadow()` or a bounded radius set; any per-frame-`scale()` text is either a compositing layer or shadow-free; canvas text under a moving camera is rasterised at bounded scales first.

**Why** — you have 100% of a 70k-line rendering engine and zero instrumentation on it. Both stalls you have hit were found by hand-building measurement. Upstream found theirs by looking at a graph.

**How to verify** — the monitor reproduces the WP0 fd curves; the probe harness flags a reverted `stageClock` read as "only 5 distinct positions across 61 frames" (the negative control from turn 1) without anyone editing test code.

---

### WP3 — Close the stage prop contract (3–5 days)

**What** — thread the settings your UI already exposes through `OriginalFoliaVisualizerStage.tsx`: `staticMode`, `isDaylight`, `backgroundStaticMode`, `subtitleOverlay*`, `harmonySubtitle*`, `isPreviewMode`, `onBack`, `isPanelOpen`; and stop hardcoding `lyricsFontScale` / `subtitleFontScale` / `visualizerOpacity` to `1` and `showText` to `true`. Add the `stageModeWiring` assertions to cover each.

**Why** — these are visible, user-facing settings that currently do nothing on 13 of 13 modes. Highest value-per-line in this document, and it is the same root cause as the sonnet `render` drift: the contract is not enforced anywhere.

**How to verify** — extend `stageModeWiring.test.tsx`: for every field in `VisualizerRendererProps`, assert the stage passes a non-default value through. That test, not a human, should have caught this.

---

### WP4 — Ship the features you already wrote (1–2 weeks)

Everything here is code that exists and is unreachable (§4). Wiring is cheaper than writing.

| Feature | Already written | Missing | Value |
|---|---|---|---|
| **Tempera image pool** | `services/temperaLayerImages.ts` (IndexedDB store + zip), scene builder, tuning, runtime all support a populated pool | ~20 lines in `VisualizerTempera.tsx` (`useState` → `loadTemperaLayerImageBlobs(placements)` → key the rebuild on the **id set**, not the array — a slider drag hands down a new array per pointer move) + the pool UI (which is the dead duplicate tree) | User-visible, and `docs/tempera-image-pool.zh-TW.md` already describes it as shipped |
| **Frame-rate cap** | `utils/frameRateLimiter.ts` (197) | Install it on the Pixi tickers + a Graphics settings row | Directly relevant to "stuck" on weak hardware; upstream exposes it |
| **Equalizer** | `utils/audioEqualizer.ts` (120) | Web Audio graph hookup + UI | Upstream has a whole `services/audioEffects/` (reverb, wow, noise branches) |
| **ReplayGain** | `utils/replayGain.ts` (52) | Scan step + gain application | Normalises volume across a queue |
| **Lyric offset memory** | `utils/lyrics/lyricOffsetMemory.ts` (96) | Persist/apply | Small, high-satisfaction |
| **Queue add behaviour** | `utils/queueAddBehavior.ts` (83) | Setting + store wiring | — |
| **Chorus detection** | `chorusDetector` / `chorusEffects` / `chorusResolver` (213) | Wiring into lyric rendering | Upstream uses it for claddagh's chorus layers |
| **`still` mode** | — (115 lines upstream) | Port it | Cheapest path to 14/14 |

**Also:** add a **Graphics** section to Settings — there is none today (no `frameRate`, `renderQuality`, `textureResolution` or `performance` control anywhere in `pages/Settings.tsx`), which is where the frame-rate cap, the glow-quantize toggle from WP0 and upstream's Lab switch all belong.

**Why** — ~700 lines of finished, tested-looking feature code is currently 100% waste. Wiring it is days, not weeks.

---

### WP5 — The real product gaps (decide scope first)

This is the 18.3%, and it is a **strategy decision before it is a backlog**. Do not start it until WP0–WP4 are in.

- **`zh-CN` locale.** You ship `en` + `zh-TW`. Upstream ships `zh-CN`. For your audience this is arguably the single highest-ROI product item in this document, and it is mechanical. **Do this early — it does not need to wait for WP5.**
- **Local library, properly.** `dexie` + `fake-indexeddb` + `music-metadata` + `file-type`, then upstream's shape: a `library/` subsystem with a `core/{contracts, model, services, state}` layer and swappable `app/` ports (account, directory-batch, home, mutation, playback). You have 11 unreachable utils (§4/§5) as a head start — read them before writing anything, they encode real decisions. This is the biggest single item: **279 files / 55,890 lines upstream vs 15 / 1,557 here.** Weeks, not days. Do not attempt it before WP1, because the dead utils will confuse every attempt to find "what already exists".
- **Navidrome.** 15 files upstream, inside `library/core`. Your tree already mentions Navidrome in 14 files and `utils/appNavidromeLyrics.ts` (97) + `utils/lyrics/adapters/NavidromeLyricAdapter.ts` (75) + `utils/lyrics/navidromeStructuredLyrics.ts` (247) are written but unreachable. Self-hosted-server support is a *natural* fit for a PWA and a differentiator against Spotify/YouTube-only — and it is a much smaller door into the local-library problem than building the whole subsystem. **Consider doing Navidrome first and letting it pull the library layer in behind it.**
- **Music sources.** Upstream's NetEase/QQ/KuGou/Bodian are region-specific and legally fraught; you have Spotify/YouTube Music. Decide deliberately whether to compete here. Your unregistered KuGou/AMLL *lyric* providers are a cheaper win than full source integration.
- **Sleep timer, lyrics export, scrobbling** — all absent (`sleepTimer`: 0 files, `lyricExport`: 0 files, `scrobble`: 1 file). All small. All upstream features.

**Explicitly do not attempt** — upstream's own docs already call these Electron-only, and they are infeasible for a PWA:
- Wallpaper mode, Folium mods, Discord rich presence / system tray
- **Automix** — ≈200 MB ONNX model plus a utility process
- Electron-only transparent MOV export
- The sync backend, unless you decide Echora is a multi-device product (that is a different project, not a port)

---

### Suggested sequencing

```
Week 1-2   WP0 (leak)  ─┬─►  WP2 (monitor + probes)  ──► gives you the curves that prove WP0 worked
                        └─►  WP3 (stage prop contract)    small, independent, user-visible
Week 2-4   WP1 (delete 14k lines → lift tsconfig → CI gate)
Week 4-5   WP4 (wire what you already wrote: tempera pool, frame-rate cap, equalizer, ReplayGain)
Week 5+    zh-CN locale  (mechanical, don't let it wait)
Then       WP5 — but decide scope before writing code
```

WP1 must come *after* WP0 only because WP0 adds `@types/three` (7 of the errors); the deletion itself is independent and could start immediately.

---

## 8. Corrections to existing documentation

| Doc | Claim | Reality |
|---|---|---|
| `docs/echora-gap-analysis.zh-TW.md` | Baseline v0.7.13; **11 of 14** modes ported | Baseline is now **v0.7.15** (upstream grew from ~1,313 files / 256,765 lines to 2,190 / 388,469). You have **13 of 14** — only `still` is missing (plus `videoLayer`). |
| `docs/echora-gap-analysis.zh-TW.md` | Tempera image pool complete (`69dfb22`) | The **storage** is complete; the **renderer never receives it** (`VisualizerTempera.tsx:150` → `EMPTY_TEMPERA_IMAGE_BLOBS`; `loadTemperaLayerImageBlobs` has no caller). `docs/tempera-image-pool.zh-TW.md` reads as shipped. See §5. |
| `docs/echora-gap-analysis.zh-TW.md` | Next steps: site-wide toast host + dead settings panels | Superseded by the priorities in §7 — a live fd leak and a 65% type-checking blind spot outrank both. |
| `docs/folia-upstream-specialities.md` | 1,313 files / 256,765 lines, 479 test files, **42 probes** | v0.7.13 numbers. At v0.7.15: 2,190 files / 388,469 lines, **547** test files + 53 e2e specs. The "42 probes" figure does not survive checking — `find . -name '*.probe.ts'` in upstream returns **1**. Do not re-quote it. |
| `tsconfig.visualizers.json` header comment | "`src/types.ts` imports three type modules that do not exist"; "`src/utils/**` … is dead code left over from an earlier port" | **Both claims were wrong, and the comment has been corrected.** All three modules exist (`src/types/onlineMusic.ts` 404 lines, `localLibrary.ts` 66, `localCover.ts` 26) and resolve cleanly under the main `tsc`. And `src/utils/**` is not dead code — it is *excluded from type checking*, which is a different thing; after WP1a deleted the 77 genuinely unreachable files, `src/utils` is overwhelmingly live code that simply is not checked. Reading "excluded" as "unused" is precisely what let the sonnet `measureText` `ReferenceError` (§3.3) sit unnoticed on a live path. `KNOWN_DEBT` in the gate script is already empty. |

---

## Appendix A — reproducing every number

```bash
# Baselines
cd /home/user/echora          && git rev-parse --short HEAD      # 9d236d5
git clone https://github.com/chthollyphile/folia-major /tmp/folia-upstream
cd /tmp/folia-upstream        && git rev-parse --short HEAD      # 43e7846d, v0.7.15

# Scale (§1)
count() { find "$1" \( -name '*.ts' -o -name '*.tsx' \) | xargs cat | wc -l; }
count packages/web/src                                  # 107,904
count packages/web/src/original-folia-visualizers       #  70,609
cd /tmp/folia-upstream && count src                     # 274,291
count src/components/visualizer                         #  70,594

# Per-mode lines (§1)
for m in cadenza cappella claddagh classic diorama fume lumiere monet partita pendolo sonnet tempera tilt still; do
  echo "$m $(count packages/web/src/original-folia-visualizers/$m) $(cd /tmp/folia-upstream && count src/components/visualizer/$m)"
done

# Tests (§6)  — note upstream keeps tests in a top-level test/, not beside source
find . \( -name '*.test.ts' -o -name '*.test.tsx' \) | grep -v node_modules | wc -l   # echora 76, upstream 547
find . \( -name '*.spec.ts' -o -name '*.spec.tsx' \) | grep -v node_modules | wc -l   # echora  3, upstream  53

# Type debt (§3)  — config MUST live inside packages/web (baseUrl/paths resolve
# relative to the extending file; a copy in /tmp silently reports 0 errors)
cat > packages/web/tsconfig.allcheck.json <<'JSON'
{ "extends": "./tsconfig.json", "include": ["src"], "exclude": [] }
JSON
corepack pnpm --filter @echora/web exec tsc -p tsconfig.allcheck.json --noEmit 2>&1 \
  | tee /tmp/allcheck.txt | grep -cE '^[^ ].*error TS'                              # 89 today
grep -oE 'error TS[0-9]+' /tmp/allcheck.txt | sort | uniq -c | sort -rn             # by code
rm packages/web/tsconfig.allcheck.json          # scratch only — never commit this
node scripts/check-visualizer-types.mjs          # from the REPO ROOT, not packages/web

# Dead code (§4) — reachability walk; roots listed in the section itself
node scripts/check-dead-code.mjs                 # 17 files / 3,811 lines (3.9%) after WP1a
node scripts/check-dead-code.mjs --list          # every path
node scripts/check-dead-code.mjs --budget 4000   # ratchet: exit 1 if unreachable code grows back

# History: 175 errors / 95 dead files was the pre-WP1 baseline. Reproduce it with
#   git stash && git checkout 9cea1d3 -- . && node scripts/check-dead-code.mjs

# Leak evidence (§2)
grep -n 'textShadow: "none"' packages/web/src/original-folia-visualizers/classic/Visualizer.tsx
grep -n 'willChange'         packages/web/src/original-folia-visualizers/cadenza/VisualizerCadenza.tsx  # none
grep -rn 'isGlowBlurQuantized\|wordGlowVariants\|quantizeShadowBlur' packages/web/src                    # none
```

Sandbox notes for whoever runs this next: `/tmp` and `node_modules` **do not persist between sessions** — re-clone upstream (≈5 s) and re-run `corepack pnpm install --prefer-offline` (≈11 s). `corepack pnpm exec tsc` from `packages/web` fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`; use `corepack pnpm --filter @echora/web exec tsc -p <cfg>` from the repo root. Use `> file 2>&1`, not `2>&1 > file`.

---

*Related: `docs/tempera-lumiere-stall-diagnosis.md` (stall cause #1, fixed in `9d236d5`), `docs/tempera-port.zh-TW.md`, `docs/lumiere-port.zh-TW.md`, `docs/tempera-image-pool.zh-TW.md`.*
