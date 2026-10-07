# What makes the upstream project (folia-major) special

Research notes on [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) @
`master` (v0.7.13, 2026-10-05), written while porting from it into Echora.

Measurements and quotes below are the upstream repo's own (its docs and comments cite their numbers).

## Thesis

Folia is not "a music player with animated lyrics". It is a **procedural lyrics-film (PV) engine
with a player attached** — it compiles a song's lyric timing into a seeded, deterministic shot
program and *renders* it the way a motion-graphics studio would, then wraps that engine in the
infrastructure that lets streamers, modders and tinkerers use it as a component.

Scale of that engine: **14 visualizer modes, ~58,000 lines** in `src/components/visualizer/`
(plus ~4,300 lines of backgrounds) out of 256,765 lines of TS/TSX overall.

| mode | lines | files | what it is |
|---|---:|---:|---|
| `lumiere` 绘光 | 11,536 | 60 | stage-lighting director: volumetric beams, fog, line art, 11 light rigs |
| `tempera` 凝彩 | 11,426 | 50 | screentone/MG PV: **121 shot kinds** in 13 families |
| `sonnet` 商籁 | 11,165 | 55 | deterministic Japanese MG lyric-PV director |
| `diorama` 镜台 | 6,677 | 23 | 3D lyric flythrough along a corridor, point-cloud geometry |
| `monet` / `fume` / `pendolo` | 3,740 / 3,660 / 2,398 | 12 / 16 / 13 | canvas-, layout- and clockwork-based modes |
| the other 7 | ~7,400 | | classic, cadenza, partita, cappella, claddagh, tilt, still |

## 1. The lyric-PV "director" engines

The three big modes are not animations bolted onto subtitles; each **compiles the whole song first**
and then renders from absolute playback time:

* **Sonnet** compiles lines → semantic segments (grapheme-timed) → paragraphs (6 kinds) → shots
  (7 kinds: editorial-column, type-impact, fragment-collage, tracking-ribbon, mask-reveal,
  poster-blocks, quiet-tableau) → typography placements (hero / semi-hero / support roles, vertical
  CJK columns, measured boxes) → per-glyph Pixi text with halos, chromatic-aberration copies and echo
  ghosts → camera (breath, focus tracking, z-depth parallax) → transitions (`fast-blur`,
  `mono-glitch`, `camera-pull`) → post-process chain → credits card. The MG artwork alone is split
  into 9+ families (celestial, marine, botanical, flora, craft, kinetic, landscape, music,
  architecture). Every composition is seeded, so the same song renders identically.
* **Tempera** has **121 shot kinds** grouped in 13 families (split / band / frame / poster / sparse /
  cinema / charm / aperture / signal / corridor / monolith / terrain / monogatari-blank). Decor per
  shot is decided at compile time — *"渲染层零随机"* (zero randomness in the render layer). It uses a
  **difference filter** to pick ink or paper per pixel against the rendered backdrop, punches real
  holes through to the shell background layer (`GraphicsContext.cut()`), compiles ≥1.2 s gaps into
  lyric-less "bridge shots" so instrumentals keep moving, and hands shots over along a `flowAngle`
  so boundaries read as one long take rather than cuts.
* **Lumiere** (added 2026-09-29) is a lighting director: 11 light rigs, volumetric shaders, smoke,
  line-art "graphic groups", lyrics lit by the beams. It can compile an entire song into a single
  unit with seamless lighting handovers (~45–50 ms per unit scene build) instead of per-paragraph cuts.

Supporting this, the timing model is treated honestly: per-glyph timings are *synthesized*
(equal-split inside words), zero-duration punctuation has to be re-timed, and the docs call out that
many "animation bugs" are actually timing-data artifacts.

## 2. GPU/memory engineering with receipts

This is where the repo is most unusual — every hard decision carries a measurement and a stated
trade-off:

* **Pixi texture-pool economics** (`pixiTextureBudget.ts`): a render pass is billed by power-of-two
  *bucket*, not by frame. Measured on Intel iGPU: a 781×850 viewport at 1.5× rasterizes into a
  2048² bucket that is 71 % empty; growing a window from 640² to 700² raised resident GEM from
  628 MB to 822 MB with no visual change. Their resolution *snapping* returns 1.2047 instead of 1.5 —
  20 % softer but a quarter of the VRAM, fill rate 29 %→92 %, measured GEM 978→689 MB (−30 %), and
  pixel-identical (max diff 1/255) to setting the slider there by hand.
* **Pixi landmines documented in-repo**: filters default to hardcoded `resolution: 1`; the minimum
  resolution wins across a filter array; `cut()` is missing a `break` so a second hole attaches to an
  unrelated fill; a *disabled* filter left parked in the stack copies `uBackTexture` from (0,0) so
  every glyph inverts against the top-left pixel; `useBackBuffer` / `blendRequired` requirements.
* **Crash avoidance**: a `highp` fragment-precision flip in `loadPixi()` (fp16 overflow in
  `NoiseFilter` → black triangles on Linux/NVIDIA), batching chromatic-aberration copies to avoid an
  observed Intel iGPU hang, `repeatEdgePixels` to stop the vignette drifting while a blur ramps.
* **Leak hunting as a first-class activity**: `docs/linux-glyph-cache-fd-leak.md`,
  `docs/automix-memory-optimization.md`, and manual probes (`visualizer-memory-probe.mjs`,
  `lattice-cover-memory.mjs`, `analysis_idle_release.mts`).

## 3. The stage as infrastructure (streamers, live streams, editors)

* **Stage API**: a local HTTP API (`127.0.0.1:32107`, Bearer token) — `GET /stage/health|status`,
  `POST /stage/lyrics|session|player/search|player/play`. External programs can push lyrics, push a
  media session, or search and play. The repo ships a **Bilibili live-danmaku song-request demo**
  (`test/manual/bili-livesong/main.py`) and a Quickshell/Waybar bar plugin (`lia.lines`) that reads
  the `folia-v1-lyric` interface and doubles as a simple MPRIS widget.
* **OBS sources** (`src/components/obs/`): a browser-source visualizer driven by SSE from the main
  window, a now-playing source, and a PlayerCap source. Assets (Tempera's image pool, Monet covers,
  Cappella emoji packs) are resolved to data URLs and shipped inside the SSE config, because the OBS
  page is served from `127.0.0.1:PORT` and cannot read the app's IndexedDB.
* **Transparent MOV export**: a sample mod renders the lyric animation to a video with an alpha
  channel for editors (`render.export` permission, main-process export service).

## 4. Product/platform breadth most players never attempt

* **Folium mod platform** (Forge-shaped): registries, an event bus, services, and a version-pinned
  `internals` escape hatch. Mods run as trusted code with a **native** enable dialog, trust bound to
  the content hash (any file change revokes it), plus official signing and a mod marketplace. Sample
  mods add a whole Pixi visualizer (52Hz), retune built-in modes, add progress-bar buttons and web
  layers, and call Node/ffmpeg from the main process.
* **Automix**: real DJ-style transitions, not crossfades — **Beat This!** beat/downbeat ONNX (they
  verified their pre/post-processing against the official Python: **F = 1.0000, mean offset
  0.00 ms** on 30 songs, WebGPU in a utility process) plus **htdemucs** stem separation where they
  made their own model change (segment halved → 108.6 MB, peak memory 789→483 MB, 19 % faster).
  Then key/tempo/LUFS analysis, phrase quantization, four transition styles (`beatCut`, `bassSwap`,
  `tailRide`, `plainBlend`), stem-level handover, echo throw, tempo bend.
* **Desktop as a first-class target**: wallpaper mode with three separate implementations (Windows
  `SetParent` into WorkerW via a Rust helper with Raw-Input mouse forwarding and a watchdog; Linux
  `wlr-layer-shell` via `windowtolayer`; macOS window-level FFI), a companion remote-control window,
  system tray, Discord presence, three release channels (Realeco/Limo/Cielo), AUR + Flatpak + Docker
  + Vercel/Cloudflare deploys, and a Capacitor path for Android.
* **Lyric plumbing**: NetEase / QQ / KuGou / Navidrome / local, LDDC enhanced word-by-word formats,
  the AMLL TTML database, Now Playing (WS) integration, chorus/harmony overlays, user-adjustable word
  segmentation with an AI (Gemini) segmentation path — sharing one prompt module between the
  "run it for me" and "copy the prompt" flows.

## 5. Process/DX culture (arguably as distinctive as the product)

* 256,765 lines of TS/TSX across 1,313 files; **479 unit test files** and 47 spec files.
* **42 in-app "probes"** at `/dev-probe.html` — one isolated harness per hard feature — plus
  `playwright.probe.config.ts`, which runs `*.probe.ts` measurement files **single-worker on
  purpose**: *"a render count is only attributable on a machine that is not otherwise busy"*.
* **Generated `docs/CODEMAP.md`** derived from the TypeScript compiler + module graph, CI-verified,
  and deliberately reporting **magnitudes instead of exact counts** (`512+`) so ordinary file churn
  does not create meaningless sync commits; precise numbers are answered on demand by a
  `ts-code-map` CLI/MCP server.
* **`AGENTS.md` + `skills/*/SKILL.md`**: the repo openly says it is developed with AI assistance and
  ships machine-readable navigation rules, glossary alignment and runtime guardrails for agents.
* Docs that explain **why**, including rejected alternatives and accepted trade-offs (Tempera's
  README is effectively a design spec for the mode).
* Traction: **3,535 stars / 269 forks**, project created 2025-11-28, ~27 code contributors
  (35 in the all-contributors list), releases landing most days, Trendshift-featured.

## What this means for Echora

Echora vendored **11 of the 14 modes** and none of the service layer. Specifically absent:

* the three **engine-tier** modes — `tempera` 凝彩, `lumiere` 绘光, and the lightweight `still`
  静止 — plus the `videoLayer` stage layer;
* everything in §3: Stage API, OBS sources, transparent MOV export;
* everything in §4: Folium mods, automix, wallpaper mode, sync server, the wider lyric plumbing;
* most of §2's budget/measurement helpers (Echora has `pixiTextureBudget.ts` already) and §5's
  process tooling.

If the goal is "feel like Folia", the highest-leverage ports are, in order: **(a)** the three
director engines' *compile-then-render* architecture, **(b)** the OBS browser source + Stage API,
which is what makes the stage useful to streamers, **(c)** the measurement/budget discipline that
keeps it at 60 fps. Porting individual modes without (c) is what produced the stalls documented in
`docs/sonnet-diorama-stall-diagnosis.md`.
