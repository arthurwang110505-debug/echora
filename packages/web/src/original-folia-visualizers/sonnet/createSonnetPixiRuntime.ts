import type { MotionValue } from "framer-motion";
import type { AudioBands, SonnetTuning, Theme } from "../../types";
import type { SonnetProgram } from "./types";
import { findSonnetParagraphIndexAtTime } from "./sonnetProgram";
import {
  buildSonnetIconDataUrl,
  buildSonnetIconTextureKey,
  resolveSonnetIconNames,
} from "./sonnetIcons";
import {
  clamp01,
  easeSonnetInOut,
  resolveSegmentProgress,
  resolveSonnetAnimationScale,
  resolveSonnetBreathWeight,
  resolveSonnetCameraBreath,
  resolveSonnetFocusWeights,
  resolveSonnetSmoothedCameraFocus,
  resolveShotMotionFrame,
  resolveShotProgress,
  resolveTimelineShake,
} from "./sonnetMotion";
import { hashSonnetSeed } from "./sonnetRandom";
import {
  IDLE_SONNET_TRANSITION_FRAME,
  resolveSonnetEnterTransitionFrame,
  resolveSonnetExitTransitionFrame,
  resolveSonnetShotTransitionFrame,
} from "./sonnetTransitions";
import {
  completeSceneBuild,
  startSceneBuild,
  stepSceneBuild,
  type IncrementalSceneBuild,
  type SceneView,
  type ShotView,
} from "./sonnetSceneBuilder";
import { SonnetSceneSchedule } from "./sonnetSceneSchedule";
import { isSonnetEmphasisRole } from "./sonnetTypographyLayout";
import { getSonnetTexturePool } from "./sonnetTexturePool";
import {
  destroySonnetContainerChildren,
  unloadSonnetDisplayTree,
} from "./sonnetPixiResources";
import {
  buildSonnetCreditsPoster,
  hasSonnetCreditsMetadata,
  resolveSonnetCreditsFrame,
} from "./sonnetCredits";
import { sonnetDebugState } from "./sonnetDebug";
import { resolveSonnetSegmentCameraFocus } from "./sonnetCameraTracking";

// src/components/visualizer/sonnet/createSonnetPixiRuntime.ts
// Owns Pixi lifecycle and mutates bounded scene views directly from absolute playback time.
type PixiModule = typeof import("pixi.js");

/** Max milliseconds the ticker may spend on scene construction per frame. */
const SCENE_BUILD_FRAME_BUDGET_MS = 4;
/** Lookahead (seconds) for background pre-building of upcoming paragraphs. */
const SCENE_PREBUILD_LOOKAHEAD_SECONDS = 15;
/** Debounce for host resize (URL-bar collapse, keyboard pop, etc.). */
const RESIZE_DEBOUNCE_MS = 150;
/** Debounce for structural tuning/theme rebuilds while dragging sliders. */
const REBUILD_DEBOUNCE_MS = 120;

export interface SonnetSongMetadata {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
}

export interface SonnetRuntimeOptions {
  host: HTMLDivElement;
  program: SonnetProgram;
  theme: Theme;
  tuning: SonnetTuning;
  currentTime: MotionValue<number>;
  audioPower?: MotionValue<number>;
  audioBands?: AudioBands;
  lyricsFontScale: number;
  staticMode: boolean;
  paused: boolean;
  performanceTier?: "full" | "compact";
  songTitle?: string | null;
  songArtist?: string | null;
  songAlbum?: string | null;
  signal?: AbortSignal;
}

interface SceneRecord {
  scene: SceneView;
  /** Structural signature the scene was built with; a mismatch means stale. */
  signature: string;
  /** true until the off-screen warm-up render has uploaded glyph textures. */
  warmed: boolean;
}

export class SonnetPixiRuntime {
  private readonly sceneCache = new Map<number, SceneRecord>();
  /** In-progress incremental builds keyed by paragraph index. */
  private readonly buildingScenes = new Map<number, IncrementalSceneBuild>();
  /** Paragraphs whose old scene was dropped while a fresh one builds in background. */
  private readonly rebuildingIndexes = new Set<number>();
  private readonly buildSchedule = new SonnetSceneSchedule();
  private readonly iconTextures = new Map<string, import("pixi.js").Texture>();
  private readonly iconUrls = new Set<string>();
  /** Glyphs whose settled transform was already written, to skip per-frame work. */
  private settledGlyphs: WeakSet<object> = new WeakSet();
  /** Bumped when tuning changes so settled-glyph skips are invalidated once. */
  private settledGlyphsGeneration = 0;
  private appliedSettledGlyphsGeneration = -1;
  private activeParagraphIndex = -1;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastScheduledIndex = -1;
  private rebuildGeneration = 0;
  private documentHidden = false;
  private pendingResize = false;

  private sceneContainer!: import("pixi.js").Container;
  private creditsContainer!: import("pixi.js").Container;
  private overlayContainer!: import("pixi.js").Container;
  private warmContainer!: import("pixi.js").Container;
  private outroBlurFilter: import("pixi.js").BlurFilter | null = null;
  private outroBlurScene: SceneView | null = null;

  private constructor(
    private readonly pixi: PixiModule,
    private readonly options: SonnetRuntimeOptions,
    private readonly app: import("pixi.js").Application,
  ) {}

  static async create(options: SonnetRuntimeOptions) {
    const pixi = await import("pixi.js");
    const app = new pixi.Application();
    const width = Math.max(options.host.clientWidth, 320);
    const height = Math.max(options.host.clientHeight, 240);
    await app.init({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: options.tuning.textureResolution,
      autoStart: false,
      sharedTicker: false,
      preference: "webgl",
      powerPreference: "high-performance",
    });
    const runtime = new SonnetPixiRuntime(pixi, options, app);
    runtime.sceneContainer = new pixi.Container();
    runtime.creditsContainer = new pixi.Container();
    runtime.overlayContainer = new pixi.Container();
    runtime.warmContainer = new pixi.Container();
    // The warm-up container renders off screen only; never add it to the stage.
    app.stage.addChild(
      runtime.sceneContainer,
      runtime.creditsContainer,
      runtime.overlayContainer,
    );

    if (options.signal?.aborted) {
      runtime.destroy();
      throw new DOMException(
        "Sonnet runtime creation was cancelled",
        "AbortError",
      );
    }
    options.host.appendChild(app.canvas);
    app.canvas.style.cssText = "width:100%;height:100%;display:block";
    await runtime.preloadIcons();
    if (options.signal?.aborted) {
      runtime.destroy();
      throw new DOMException(
        "Sonnet runtime creation was cancelled",
        "AbortError",
      );
    }
    runtime.install();
    return runtime;
  }

  private install() {
    this.resizeToHost();
    this.app.ticker.add(this.renderFrame);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed) return;
      // Coalesce rapid resizes (mobile URL bar collapse, orientation change,
      // keyboard pop-up): a rebuild is expensive and a stale size for a few
      // frames is invisible, so wait until the layout settles.
      this.pendingResize = true;
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        if (this.destroyed || !this.pendingResize) return;
        this.pendingResize = false;
        if (this.resizeToHost() && this.options.paused) this.renderOnce();
      }, RESIZE_DEBOUNCE_MS);
    });
    this.resizeObserver.observe(this.options.host);
    if (typeof document !== "undefined") {
      this.documentHidden = document.visibilityState === "hidden";
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
    this.renderOnce();
    if (!this.options.paused && !this.documentHidden) this.app.start();
  }

  private handleVisibilityChange = () => {
    if (this.destroyed) return;
    const hidden = document.visibilityState === "hidden";
    this.documentHidden = hidden;
    if (hidden) {
      this.app.stop();
    } else if (!this.options.paused) {
      // Resume: present a fresh frame immediately, then restart the ticker.
      this.renderOnce();
      this.app.start();
    }
  };

  private resizeToHost() {
    if (this.destroyed) return false;
    const width = Math.max(this.options.host.clientWidth, 320);
    const height = Math.max(this.options.host.clientHeight, 240);
    // Ignore sub-pixel / URL-bar jitter: a change smaller than 8px on the
    // short side does not justify destroying every cached scene.
    const shortSideChanged = Math.abs(
      Math.min(width, height) - Math.min(this.lastWidth, this.lastHeight),
    );
    if (width === this.lastWidth && height === this.lastHeight) return false;
    if (this.lastWidth > 0 && shortSideChanged < 8) return false;
    this.lastWidth = width;
    this.lastHeight = height;
    this.app.renderer.resize(width, height);
    this.clearScenes();
    this.buildSchedule.clear();
    this.buildingScenes.clear();
    this.rebuildGeneration += 1;
    this.lastScheduledIndex = -1;
    this.drawCredits(width, height);
    this.drawOverlay(width, height);
    return true;
  }

  private drawCredits(width: number, height: number) {
    destroySonnetContainerChildren(this.creditsContainer);
    if (this.options.tuning.showOnlyText) return;
    const metadata = {
      title: this.options.songTitle,
      artist: this.options.songArtist,
      album: this.options.songAlbum,
    };
    if (!hasSonnetCreditsMetadata(metadata)) return;
    this.creditsContainer.addChild(
      buildSonnetCreditsPoster(
        this.pixi,
        this.options.theme,
        metadata,
        width,
        height,
        this.options.lyricsFontScale,
      ),
    );
    this.creditsContainer.pivot.set(width / 2, height / 2);
    this.creditsContainer.position.set(width / 2, height / 2);
    this.creditsContainer.visible = false;
  }

  setSongMetadata(metadata: SonnetSongMetadata) {
    if (this.destroyed) return;
    const changed =
      this.options.songTitle !== metadata.title ||
      this.options.songArtist !== metadata.artist ||
      this.options.songAlbum !== metadata.album;
    if (!changed) return;

    this.options.songTitle = metadata.title;
    this.options.songArtist = metadata.artist;
    this.options.songAlbum = metadata.album;
    if (this.lastWidth > 0 && this.lastHeight > 0) {
      this.drawCredits(this.lastWidth, this.lastHeight);
      if (this.options.paused) this.renderOnce();
    }
  }

  /**
   * Hot-swap the tuning object without rebuilding the runtime. Per-frame
   * knobs (camera/motion intensity, per-glyph visibility toggles, post-process
   * sliders that are read via `this.options.tuning`) take effect on the next
   * frame; structural changes (layer switches, resolution, MG density) mark the
   * cached scenes stale so they are rebuilt incrementally in the background.
   */
  setTuning(tuning: SonnetTuning) {
    if (this.destroyed || tuning === this.options.tuning) return;
    const signatureChanged =
      this.structuralSignature(tuning) !==
      this.structuralSignature(this.options.tuning);
    this.options.tuning = tuning;
    // Settled-glyph skip caches alpha/visibility; a tuning toggle may change
    // visibility, so force the next frame to rewrite every glyph once.
    this.invalidateSettledGlyphs();
    if (signatureChanged) {
      // Debounce: dragging a structural slider fires many updates/second; the
      // background rebuild should run once the value settles. Per-frame knobs
      // already took effect immediately on the line above.
      this.scheduleRebuild();
    }
  }

  /**
   * Hot-swap theme / font scale / static mode. These change glyph styles and MG
   * artwork, so cached scenes are rebuilt in the background (never a synchronous
   * teardown — the current frame stays on screen until the replacement is ready).
   */
  setVisualInputs(
    patch: Partial<
      Pick<SonnetRuntimeOptions, "theme" | "lyricsFontScale" | "staticMode">
    >,
  ) {
    if (this.destroyed) return;
    let structural = false;
    if (patch.theme !== undefined && patch.theme !== this.options.theme) {
      this.options.theme = patch.theme;
      structural = true;
    }
    if (
      patch.lyricsFontScale !== undefined &&
      patch.lyricsFontScale !== this.options.lyricsFontScale
    ) {
      this.options.lyricsFontScale = patch.lyricsFontScale;
      structural = true;
    }
    if (
      patch.staticMode !== undefined &&
      patch.staticMode !== this.options.staticMode
    ) {
      this.options.staticMode = patch.staticMode;
      structural = true;
    }
    if (structural) {
      this.scheduleRebuild();
      // Theme/icon colours may have changed; refresh icon textures lazily
      // (preloadIcons re-fetches by theme and is idempotent via the pool).
      void this.preloadIcons();
    }
  }

  private scheduleRebuild() {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      if (!this.destroyed) this.requestSceneRebuilds();
    }, REBUILD_DEBOUNCE_MS);
  }

  /**
   * Signature of build-time inputs. Two scenes with the same signature render
   * identically, so a cached scene can stay; differing signature triggers a
   * background rebuild.
   */
  private structuralSignature(tuning: SonnetTuning = this.options.tuning) {
    return [
      this.options.theme.name,
      this.options.theme.primaryColor,
      this.options.theme.secondaryColor,
      this.options.theme.accentColor,
      this.options.theme.backgroundColor,
      this.options.theme.fontWeight,
      this.options.theme.lyricsIcons,
      this.options.lyricsFontScale.toFixed(3),
      this.options.staticMode ? 1 : 0,
      tuning.textureResolution,
      tuning.mgDensity.toFixed(3),
      tuning.showOnlyText ? 1 : 0,
      tuning.showGuide ? 1 : 0,
      tuning.showBackgroundMg ? 1 : 0,
      tuning.showFixedGeo ? 1 : 0,
      tuning.showGiantDecorativeText ? 1 : 0,
      tuning.showBackgroundDecor ? 1 : 0,
      tuning.enableTransitions ? 1 : 0,
      tuning.outerFrameMode,
      tuning.postProcessEnabled ? 1 : 0,
      tuning.postProcessGrain.toFixed(3),
      tuning.postProcessContrast.toFixed(3),
      tuning.postProcessRgbShift.toFixed(3),
      tuning.postProcessHalftone.toFixed(3),
      tuning.postProcessVignette.toFixed(3),
      tuning.postProcessLensDistortion.toFixed(3),
      tuning.postProcessLensDispersion.toFixed(3),
    ].join("|");
  }

  private invalidateSettledGlyphs() {
    // WeakSet has no clear(); the cheap equivalent is to swap in a fresh set.
    this.settledGlyphsGeneration += 1;
  }

  /** Marks every cached/in-progress scene stale and queues background rebuilds. */
  private requestSceneRebuilds() {
    this.rebuildGeneration += 1;
    const signature = this.structuralSignature();
    // In-progress builds were started with old inputs; drop them.
    this.buildingScenes.forEach((build) =>
      build.container.destroy({ children: true }),
    );
    this.buildingScenes.clear();
    // Scenes with a matching signature stay (nothing structural changed for
    // them); stale scenes remain visible until their replacement finishes and
    // swaps in atomically — the frame never blanks.
    this.sceneCache.forEach((record, index) => {
      if (record.signature !== signature) {
        this.rebuildingIndexes.add(index);
        record.scene.container.visible = index === this.activeParagraphIndex;
      }
    });
    this.scheduleAroundActive(this.rebuildGeneration);
  }

  private clearOutroBlur() {
    if (this.outroBlurFilter && this.outroBlurScene) {
      this.outroBlurScene.container.filters = (
        this.outroBlurScene.container.filters ?? []
      ).filter((filter) => filter !== this.outroBlurFilter);
      this.outroBlurFilter.destroy();
    }
    this.outroBlurFilter = null;
    this.outroBlurScene = null;
  }

  private updateOutroBlur(scene: SceneView, strength: number) {
    if (strength <= 0) {
      this.clearOutroBlur();
      return;
    }
    if (this.outroBlurScene !== scene) this.clearOutroBlur();
    if (!this.outroBlurFilter) {
      this.outroBlurFilter = new this.pixi.BlurFilter({
        strength: 0,
        quality: 2,
        kernelSize: 5,
        resolution: 0.75,
      });
      scene.container.filters = [
        ...(scene.container.filters ?? []),
        this.outroBlurFilter,
      ];
      this.outroBlurScene = scene;
    }
    this.outroBlurFilter.strength = strength;
  }

  private drawOverlay(width: number, height: number) {
    destroySonnetContainerChildren(this.overlayContainer);
    if (
      this.options.tuning.showOnlyText ||
      this.options.tuning.outerFrameMode === "none"
    )
      return;
    const g = new this.pixi.Graphics();

    const paddingX = Math.max(30, width * 0.05);
    const paddingY = Math.max(30, height * 0.05);

    const primary = this.pixi.Color.shared
      .setValue(this.options.theme.primaryColor)
      .toNumber();
    const alpha = 0.5;

    // Asymmetrical, partial perimeter (Not enclosing the whole screen)
    // 1. Top-Left cluster
    g.rect(paddingX, paddingY, 30, 4).fill({ color: primary, alpha: 0.8 }); // Thick bar
    g.moveTo(paddingX, paddingY + 16)
      .lineTo(paddingX, paddingY + 120)
      .stroke({ color: primary, width: 1, alpha }); // Dropping line

    // 2. Bottom-Right cluster
    g.rect(width - paddingX - 4, height - paddingY - 16, 4, 16).fill({
      color: primary,
      alpha: 0.8,
    }); // Thick vertical bar
    g.moveTo(width - paddingX - 160, height - paddingY)
      .lineTo(width - paddingX - 20, height - paddingY)
      .stroke({ color: primary, width: 1, alpha }); // Horizontal line
    g.moveTo(width - paddingX, height - paddingY - 180)
      .lineTo(width - paddingX, height - paddingY - 30)
      .stroke({ color: primary, width: 1, alpha }); // Rising line

    // 3. Floating accents
    const drawCross = (cx: number, cy: number, size: number) => {
      g.moveTo(cx - size, cy)
        .lineTo(cx + size, cy)
        .stroke({ color: primary, width: 1, alpha: 0.8 });
      g.moveTo(cx, cy - size)
        .lineTo(cx, cy + size)
        .stroke({ color: primary, width: 1, alpha: 0.8 });
    };
    // Top-Right cross
    drawCross(width - paddingX, paddingY + 20, 6);

    // Bottom-Left diamond
    g.moveTo(paddingX, height - paddingY - 4)
      .lineTo(paddingX + 4, height - paddingY)
      .lineTo(paddingX, height - paddingY + 4)
      .lineTo(paddingX - 4, height - paddingY)
      .fill({ color: primary, alpha: 0.7 });

    // Typographic star ✦
    const starStyle = new this.pixi.TextStyle({
      fontFamily: "sans-serif",
      fontSize: 12,
      fill: primary,
    });
    const starText = new this.pixi.Text({ text: "✦", style: starStyle });
    starText.alpha = 0.6;
    starText.position.set(width - paddingX - 10, height - paddingY);
    starText.anchor.set(1, 0.5);

    this.overlayContainer.addChild(g, starText);
  }

  private async preloadIcons() {
    if (
      this.options.tuning.showOnlyText ||
      !this.options.tuning.showBackgroundDecor
    )
      return;
    const names = resolveSonnetIconNames(this.options.theme.lyricsIcons);
    const resolution = this.options.tuning.textureResolution;
    const texturePool = getSonnetTexturePool(this.pixi);
    await Promise.all(
      names.map(async (name, index) => {
        const size = 192 + (index % 4) * 32;
        const colors = [
          this.options.theme.accentColor,
          this.options.theme.secondaryColor,
          this.options.theme.primaryColor,
        ];
        const color = colors[index % colors.length];
        const key = buildSonnetIconTextureKey(
          name,
          color,
          3.5,
          size,
          resolution,
        );
        const url = buildSonnetIconDataUrl(name, color, 3.5, size);
        if (!url) return;
        try {
          this.iconTextures.set(key, await texturePool.acquire(url));
          this.iconUrls.add(url);
        } catch {
          // Invalid theme icons are optional; geometric MG remains available.
        }
      }),
    );
  }

  private clearScenes() {
    this.clearOutroBlur();
    this.sceneCache.forEach((record) => {
      this.destroyScene(record.scene);
    });
    this.sceneCache.clear();
    this.buildingScenes.forEach((build) => {
      build.container.destroy({ children: true });
    });
    this.buildingScenes.clear();
    this.rebuildingIndexes.clear();
    this.activeParagraphIndex = -1;
  }
  private destroyScene(scene: SceneView) {
    if (this.outroBlurScene === scene) this.clearOutroBlur();
    this.sceneContainer.removeChild(scene.container);
    unloadSonnetDisplayTree(scene.container);
    scene.container.filters = null;
    scene.shots.forEach((shot) => {
      shot.haloLayer.filters = null;
    });
    scene.postProcessFilters.forEach((filter) => filter.destroy());
    scene.container.destroy({ children: true });
  }

  /**
   * Synchronous scene build for paths where the scene must exist before the
   * next presented frame (startup, direct seek). Steady-state playback uses
   * the time-sliced background queue in `processBuildQueue`.
   */
  private buildSceneSync(index: number): SceneRecord | null {
    if (index < 0 || index >= this.options.program.paragraphs.length)
      return null;
    const cached = this.sceneCache.get(index);
    if (cached && cached.signature === this.structuralSignature())
      return cached;

    // A stale cached scene exists: destroy it first so filters/children don't leak.
    if (cached) {
      this.sceneCache.delete(index);
      this.destroyScene(cached.scene);
    }
    const inProgress = this.buildingScenes.get(index);
    let scene: SceneView;
    let build: IncrementalSceneBuild;
    if (inProgress) {
      // Finish the in-progress incremental build synchronously instead of
      // rebuilding from scratch; upload each shot's textures as it completes.
      build = inProgress;
      while (true) {
        const done = stepSceneBuild(this.pixi, build);
        if (!done) this.warmShotContainer(build);
        if (done) break;
      }
      scene = completeSceneBuild(this.pixi, build);
      this.buildingScenes.delete(index);
    } else {
      build = startSceneBuild(
        this.pixi,
        {
          programSeed: this.options.program.seed,
          host: this.options.host,
          theme: this.options.theme,
          tuning: this.options.tuning,
          lyricsFontScale: this.options.lyricsFontScale,
          staticMode: this.options.staticMode,
        },
        this.iconTextures,
        this.options.program.paragraphs[index],
      );
      while (true) {
        const done = stepSceneBuild(this.pixi, build);
        if (!done) this.warmShotContainer(build);
        if (done) break;
      }
      scene = completeSceneBuild(this.pixi, build);
    }
    scene.container.visible = false;
    const record: SceneRecord = {
      scene,
      signature: this.structuralSignature(),
      warmed: false,
    };
    // The background layer (built before any shot) still needs its textures;
    // warm every subtree while detached, then attach the finished scene.
    this.warmScene(record);
    this.sceneCache.set(index, record);
    this.sceneContainer.addChild(scene.container);
    this.buildSchedule.delete(index);
    this.rebuildingIndexes.delete(index);
    return record;
  }

  /**
   * Renders the scene once off screen (filters removed for the warm pass) so
   * Pixi rasterizes glyph canvases and uploads every Text texture to the GPU
   * before the scene is ever shown — eliminating the first-show upload stall.
   */
  /**
   * Off-screen renders one display subtree so Pixi rasterizes its glyph canvases
   * and uploads the Text textures to the GPU. The node is temporarily reparented
   * to the detached warm container and restored to `home` afterwards.
   */
  private warmNode(
    node: import("pixi.js").Container,
    home: import("pixi.js").Container,
  ) {
    try {
      this.warmContainer.removeChildren();
      this.warmContainer.addChild(node);
      this.app.renderer.render(this.warmContainer);
    } catch {
      // Best effort: a context that is not ready yet falls back to implicit
      // warm-up on the node's first real frame.
    } finally {
      this.warmContainer.removeChildren();
      // Reparenting detached the node; append it back. Callers iterate the
      // original children in order, so append restores the exact draw order.
      home.addChild(node);
    }
  }

  /**
   * Uploads glyph/MG textures for every subtree of a (detached, not yet shown)
   * scene by off-screen rendering one child at a time. Rendering children
   * individually spreads the cost and bypasses scene-level filters (blur/
   * glitch/post-process), which would force full-viewport passes; the filters
   * apply unchanged once the scene is on the live stage. The caller must only
   * call this while the scene container is detached.
   */
  private warmScene(record: SceneRecord) {
    if (record.warmed) return;
    const { scene } = record;
    const container = scene.container;
    const children = [...container.children];
    for (const child of children) {
      this.warmNode(child, container);
    }
    record.warmed = true;
  }

  /**
   * Off-screen renders a single freshly built shot subtree so its glyph
   * textures upload immediately rather than at first show. Called between
   * incremental build steps to spread the upload cost across frames.
   */
  private warmShotContainer(build: IncrementalSceneBuild) {
    const shotIndex = build.nextShotIndex - 1;
    const shot = build.scene.shots[shotIndex];
    if (!shot) return;
    this.warmNode(shot.container, build.container);
  }

  private scheduleAroundActive(_generation?: number) {
    const time = this.options.currentTime.get();
    this.buildSchedule.rescheduleAround(
      Math.max(0, this.activeParagraphIndex),
      this.options.program.paragraphs,
      time,
      SCENE_PREBUILD_LOOKAHEAD_SECONDS,
    );
  }

  /**
   * Advances the time-sliced scene build queue. Each individual shot build is
   * the smallest unit; between units the elapsed time is checked against the
   * per-frame budget so paragraph construction never blocks the ticker for a
   * noticeable amount.
   */
  /**
   * Advances the time-sliced scene build queue. Each shot build is the
   * smallest unit; the per-frame deadline bounds how much work the ticker
   * absorbs, so paragraph construction never blocks a frame for long.
   * In-progress scene containers stay detached (invisible) until the scene is
   * complete and its glyph textures have been warmed off screen.
   */
  private processBuildQueue(frameDeadline: number) {
    if (this.buildSchedule.size === 0 && this.buildingScenes.size === 0) return;
    const signature = this.structuralSignature();

    while (performance.now() <= frameDeadline) {
      const task = this.buildSchedule.peek();
      if (!task) {
        // Nothing queued: abandon any orphaned in-progress builds.
        this.buildingScenes.forEach((build) =>
          build.container.destroy({ children: true }),
        );
        this.buildingScenes.clear();
        return;
      }
      const { index } = task;
      // Skip if a fresh-enough scene already exists.
      const cached = this.sceneCache.get(index);
      if (cached && cached.signature === signature) {
        this.buildSchedule.delete(index);
        this.rebuildingIndexes.delete(index);
        continue;
      }

      let build = this.buildingScenes.get(index);
      if (!build) {
        const paragraph = this.options.program.paragraphs[index];
        if (!paragraph) {
          this.buildSchedule.delete(index);
          continue;
        }
        build = startSceneBuild(
          this.pixi,
          {
            programSeed: this.options.program.seed,
            host: this.options.host,
            theme: this.options.theme,
            tuning: this.options.tuning,
            lyricsFontScale: this.options.lyricsFontScale,
            staticMode: this.options.staticMode,
          },
          this.iconTextures,
          paragraph,
        );
        this.buildingScenes.set(index, build);
        // A still-cached (stale) scene remains on stage until the
        // replacement is ready, so a structural rebuild never blanks the
        // frame; drop it only at swap time.
        if (cached) this.rebuildingIndexes.add(index);
      }

      const done = stepSceneBuild(this.pixi, build);
      if (!done) {
        // Upload the freshly built shot's glyph textures off screen while
        // still within this frame's budget; the final shot is warmed below
        // on completion. Spreads texture upload cost shot-by-shot.
        if (performance.now() <= frameDeadline) this.warmShotContainer(build);
        else return;
        continue;
      }

      const scene = completeSceneBuild(this.pixi, build);
      this.buildingScenes.delete(index);
      scene.container.visible = false;
      const stale = this.sceneCache.get(index);
      if (stale) {
        this.sceneCache.delete(index);
        this.destroyScene(stale.scene);
      }
      const record: SceneRecord = { scene, signature, warmed: false };
      // Warm any subtree not uploaded during the shot steps (background
      // layer) while detached, then attach the finished scene to the stage.
      this.warmScene(record);
      this.sceneCache.set(index, record);
      this.sceneContainer.addChild(scene);
      this.buildSchedule.delete(index);
      this.rebuildingIndexes.delete(index);
    }
  }

  private pruneScenes(index: number) {
    this.sceneCache.forEach((record, sceneIndex) => {
      if (Math.abs(sceneIndex - index) <= 1) return;
      // Release GPU textures for paragraphs outside the ±1 window; they are
      // re-queued and re-built incrementally before they become visible again.
      this.rebuildingIndexes.delete(sceneIndex);
      this.destroyScene(record.scene);
      this.sceneCache.delete(sceneIndex);
    });
  }

  private updateShot(
    view: ShotView,
    time: number,
    width: number,
    height: number,
    shakeIntensity: number,
  ) {
    const tuning = this.options.tuning;
    const progress = resolveShotProgress(view.shot, time);
    const motion =
      tuning.typographyMotion * resolveSonnetAnimationScale(this.options.theme);
    const camera =
      tuning.cameraIntensity * resolveSonnetAnimationScale(this.options.theme);
    const cameraFrame = resolveShotMotionFrame(view.shot.kind, progress);

    // Add a slow continuous pan during the time gap to prevent the scene from looking frozen
    const gapTime = Math.max(0, time - view.shot.endTime);
    if (gapTime > 0) {
      // Inherit the movement direction from the tail end of the shot (progress 0.8 to 1.0)
      const tailStart = resolveShotMotionFrame(view.shot.kind, 0.8);
      const dx = cameraFrame.x - tailStart.x;
      const dy = cameraFrame.y - tailStart.y;
      const dScale = cameraFrame.scale - tailStart.scale;
      const dRot = cameraFrame.rotation - tailStart.rotation;

      // Continue drifting in that direction at a slow, relaxed PV pace
      // speed = 0.8 means it takes 1.25 seconds of gap to drift the same distance
      // the camera covered in the last 20% of the shot.
      const maxDrift = 2.0;
      const driftSpeed = (1 - Math.exp(-gapTime * 0.4)) * maxDrift;
      cameraFrame.x += dx * driftSpeed;
      cameraFrame.y += dy * driftSpeed;
      cameraFrame.scale += dScale * driftSpeed;
      cameraFrame.rotation += dRot * driftSpeed;
    }

    const shake = resolveTimelineShake(time, shakeIntensity);

    let trackSegments = view.segments.filter(
      (s) => s.role !== "decoration" && s.trackingGlyphs.length > 0,
    );
    if (trackSegments.length === 0) {
      trackSegments = view.segments.filter((s) => s.trackingGlyphs.length > 0);
    }

    // Layer a deterministic breathing float once the lyric reveal completes, so the
    // frame never goes fully static while the shot holds or drifts through a gap.
    const revealDoneTime =
      trackSegments.length > 0
        ? Math.max(
            ...trackSegments.map(
              (segment) =>
                segment.trackingGlyphs.at(-1)?.startTime ?? view.shot.endTime,
            ),
          )
        : view.shot.endTime;
    const breathWeight = resolveSonnetBreathWeight(time, revealDoneTime);
    if (breathWeight > 0) {
      const breathPhase =
        ((hashSonnetSeed(view.shot.id) % 1024) / 1024) * Math.PI * 2;
      const breath = resolveSonnetCameraBreath(time, breathPhase);
      cameraFrame.x += breath.x * breathWeight;
      cameraFrame.y += breath.y * breathWeight;
      cameraFrame.scale += breath.scale * breathWeight;
      cameraFrame.rotation += breath.rotation * breathWeight;
    }

    let currentFocusX = view.basePivotX;
    let currentFocusY = view.basePivotY;

    if (trackSegments.length > 0) {
      const focusRanges = trackSegments.map((segment) => ({
        startTime: segment.trackingGlyphs[0]?.startTime ?? view.shot.startTime,
        endTime: segment.trackingGlyphs.at(-1)?.startTime ?? view.shot.endTime,
      }));
      const resolveFocusAtTime = (focusTime: number) => {
        let focusX = 0;
        let focusY = 0;
        const focusWeights = resolveSonnetFocusWeights(focusRanges, focusTime);
        for (let i = 0; i < trackSegments.length; i++) {
          const seg = trackSegments[i];
          if (seg.trackingGlyphs.length === 0) continue;
          const weight = focusWeights[i] ?? 0;
          const pos = resolveSonnetSegmentCameraFocus(
            seg.trackingGlyphs,
            focusTime,
          );
          focusX += pos.x * weight;
          focusY += pos.y * weight;
        }
        return { x: focusX, y: focusY };
      };
      const focusTime = Math.max(
        view.shot.startTime,
        Math.min(time, view.shot.endTime),
      );
      const smoothedFocus = resolveSonnetSmoothedCameraFocus(
        focusTime,
        view.shot.startTime,
        view.shot.endTime,
        resolveFocusAtTime,
      );

      currentFocusX = smoothedFocus.x;
      currentFocusY = smoothedFocus.y;
    }

    view.container.pivot.set(
      view.basePivotX + (currentFocusX - view.basePivotX) * camera,
      view.basePivotY + (currentFocusY - view.basePivotY) * camera,
    );

    view.container.scale.set(
      view.shot.camera.zoom * (1 + (cameraFrame.scale - 1) * camera),
    );
    view.container.rotation =
      (view.shot.camera.rotation + cameraFrame.rotation + shake.rotation) *
      camera;
    view.container.x =
      view.baseX + (cameraFrame.x * width + shake.x * width) * camera;
    view.container.y =
      view.baseY + (cameraFrame.y * height + shake.y * height) * camera;

    if (view.mgParticleLayer) {
      // Create a slight time-difference/parallax effect for decorative elements
      const particleParallaxX =
        (cameraFrame.x * width + shake.x * width) * camera * 0.4;
      const particleParallaxY =
        (cameraFrame.y * height + shake.y * height) * camera * 0.4;
      view.mgParticleLayer.position.set(particleParallaxX, particleParallaxY);

      // Continuous independent rotation based on shot time
      view.mgParticleLayer.rotation = (time - view.shot.startTime) * 0.05;
      // Slower scale response creates depth illusion
      view.mgParticleLayer.scale.set(1 + (cameraFrame.scale - 1) * 0.3);
    }

    if (view.mgFixedGeoLayer) {
      // Keep fixed geometry upright regardless of camera rotation
      view.mgFixedGeoLayer.rotation = -view.container.rotation;
    }

    const audioBass = this.options.audioBands?.bass?.get() ?? 0;
    const audioPower = this.options.audioPower?.get() ?? 0;
    const audioVocal = this.options.audioBands?.vocal?.get() ?? 0;

    if ((view.mgLayer as any).updateTime) {
      (view.mgLayer as any).updateTime(
        time,
        view.shot.cues,
        view.shot.startTime,
        view.shot.endTime,
        audioBass,
        audioPower,
        audioVocal,
      );
    }

    const decorativeGlyphEffectsEnabled =
      this.options.performanceTier !== "compact";
    const showOnlyText = tuning.showOnlyText;
    const showFixedGeo = tuning.showFixedGeo;
    const showBackgroundDecor = tuning.showBackgroundDecor;
    const showGiantDecorativeText = tuning.showGiantDecorativeText;
    // After a tuning change, force one full write pass per glyph (visibility may
    // have flipped); subsequent frames return to the cheap settled-skip path.
    const settledSkipsValid =
      this.appliedSettledGlyphsGeneration === this.settledGlyphsGeneration;
    if (!settledSkipsValid) {
      this.settledGlyphs = new WeakSet();
      this.appliedSettledGlyphsGeneration = this.settledGlyphsGeneration;
    }

    view.segments.forEach((segmentView) => {
      const guide = segmentView.guide;
      const guideActive = time >= guide.startTime && time <= guide.endTime;
      guide.container.visible =
        guideActive && tuning.showGuide && !showOnlyText;
      if (guideActive) {
        const guideProgress = clamp01(
          (time - guide.startTime) /
            Math.max(0.001, guide.endTime - guide.startTime),
        );
        if ((guide as any).update) {
          guide.container.alpha = guide.maxAlpha;
          (guide as any).update(guideProgress);
        } else {
          const eased = easeSonnetInOut(guideProgress);
          guide.container.alpha = Math.sin(eased * Math.PI) * guide.maxAlpha;
          guide.container.scale.set(0.76 + eased * 0.24);
        }
      }

      // Decorative open frames share the 文字浮标 (showFixedGeo) toggle.
      const frameDecor = segmentView.frameDecor;
      if (frameDecor) {
        const frameVisible = showFixedGeo && !showOnlyText;
        frameDecor.container.visible = frameVisible;
        if (frameVisible) {
          frameDecor.update(
            clamp01(
              (time - frameDecor.startTime) /
                Math.max(0.001, frameDecor.endTime - frameDecor.startTime),
            ),
          );
        }
      }

      segmentView.glyphs.forEach((glyph) => {
        const glyphProgress = resolveSegmentProgress(
          glyph.startTime,
          glyph.settleTime,
          time,
        );
        const waiting = time < glyph.startTime;
        const offset = (1 - glyphProgress) * motion;
        const coreAlpha = waiting ? 0 : 0.16 + glyphProgress * 0.84;
        const haloAlpha = waiting ? 0 : 1 - glyphProgress * 0.28;
        const scale =
          isSonnetEmphasisRole(segmentView.role) &&
          view.shot.kind === "type-impact"
            ? 0.52 + glyphProgress * 0.48
            : 0.86 + glyphProgress * 0.14;
        const x = glyph.baseX + glyph.enterX * offset;
        const y = glyph.baseY + glyph.enterY * offset;
        const rotation = glyph.finalRotation + glyph.entryRotation * offset;
        const isGiantDecorativeText = segmentView.role === "decoration";
        const showTextGlyph = glyph.isTextGlyph !== false;
        const glyphVisible = showOnlyText
          ? showTextGlyph && (!isGiantDecorativeText || showGiantDecorativeText)
          : (!glyph.isBackgroundShape || showBackgroundDecor) &&
            (!isGiantDecorativeText || showGiantDecorativeText);

        // Simulated Parallax 3D effect
        const depth = glyph.zDepth || 0;
        // Move faster/slower than camera
        const parallaxX =
          (cameraFrame.x * width + shake.x * width) * camera * depth * 2.5;
        const parallaxY =
          (cameraFrame.y * height + shake.y * height) * camera * depth * 2.5;
        // Scale larger if closer to camera (positive depth)
        const depthScale = 1 + depth * 0.45;

        // After a glyph has settled, its transform/alpha stop changing
        // (only camera parallax still moves depth-bearing decorative glyphs).
        // Skip the redundant writes for flat settled glyphs.
        const settled = glyphProgress >= 1;
        const canSkipStaticWrites =
          settled &&
          depth === 0 &&
          (!glyph.ghosts ||
            !decorativeGlyphEffectsEnabled ||
            time >= glyph.startTime + (glyph.ghostDuration ?? 0));
        if (canSkipStaticWrites && this.settledGlyphs.has(glyph)) {
          // Visibility can still flip via tuning toggles; keep it current.
          glyph.display.visible = glyphVisible;
          return;
        }

        glyph.display.alpha = coreAlpha;
        glyph.display.visible = glyphVisible;
        glyph.display.scale.set(scale * depthScale);
        glyph.display.position.set(x + parallaxX, y + parallaxY);
        glyph.display.rotation = rotation;
        if (glyph.halo) {
          glyph.halo.visible = decorativeGlyphEffectsEnabled && glyphVisible;
          if (decorativeGlyphEffectsEnabled) {
            glyph.halo.alpha = haloAlpha;
            glyph.halo.scale.set(scale * (1.08 - glyphProgress * 0.08));
            glyph.halo.position.set(x, y);
            glyph.halo.rotation = rotation;
          }
        }

        // Animate Chromatic Aberration separation and merging only on the full profile.
        if (glyph.caCyan && glyph.caRed && glyph.caOffset) {
          glyph.caCyan.visible =
            decorativeGlyphEffectsEnabled && glyphVisible && !showOnlyText;
          glyph.caRed.visible =
            decorativeGlyphEffectsEnabled && glyphVisible && !showOnlyText;
          if (decorativeGlyphEffectsEnabled) {
            // Starts separated (impact), and gently merges to a very subtle base offset
            const mergeEased = easeSonnetInOut(glyphProgress);
            const currentOffset = glyph.caOffset * (1 - mergeEased * 0.8); // 1.0 -> 0.2

            glyph.caCyan.position.set(-currentOffset, currentOffset * 0.5);
            glyph.caRed.position.set(currentOffset, -currentOffset * 0.5);
          }
        }

        // Semi-hero echo ghosts are optional decoration and are skipped on compact mobile.
        if (
          decorativeGlyphEffectsEnabled &&
          glyph.ghosts &&
          glyph.ghostDuration
        ) {
          const ghostProgress = clamp01(
            (time - glyph.startTime) / glyph.ghostDuration,
          );
          const ghostActive =
            glyphVisible && ghostProgress > 0 && ghostProgress < 1;
          // Quick fade-in, then a squared falloff so the echo dies fast.
          const envelope =
            ghostProgress <= 0.2
              ? ghostProgress / 0.2
              : Math.pow(1 - (ghostProgress - 0.2) / 0.8, 2);
          const spread = 1 - Math.pow(1 - ghostProgress, 3);
          for (const ghost of glyph.ghosts) {
            ghost.node.visible = ghostActive;
            if (!ghostActive) continue;
            ghost.node.position.set(ghost.dirX * spread, ghost.dirY * spread);
            ghost.node.alpha = envelope * ghost.alphaBase;
          }
        }

        if (canSkipStaticWrites) this.settledGlyphs.add(glyph);

        glyph.updateAnimation?.(time);
      });
    });
  }

  private renderFrame = () => {
    if (this.destroyed || this.options.program.paragraphs.length === 0) {
      sonnetDebugState.activeShot = null;
      sonnetDebugState.paragraphIndex = -1;
      return;
    }

    const frameStart = performance.now();
    const frameDeadline = frameStart + SCENE_BUILD_FRAME_BUDGET_MS;
    const time = this.options.currentTime.get();
    const paragraphIndex = findSonnetParagraphIndexAtTime(
      this.options.program,
      time,
    );

    if (paragraphIndex !== this.activeParagraphIndex) {
      // Seeks can jump to an arbitrary paragraph: drop stale queued work and
      // re-plan around the new active position.
      const jumped =
        this.activeParagraphIndex >= 0 &&
        Math.abs(paragraphIndex - this.activeParagraphIndex) > 1;
      this.activeParagraphIndex = paragraphIndex;

      const activeRecord = this.sceneCache.get(paragraphIndex);
      const activeReady =
        activeRecord && activeRecord.signature === this.structuralSignature();
      if (!activeReady) {
        // The visible scene must exist now (startup/seek). Build it
        // synchronously; neighbours/upcoming paragraphs pre-build in the
        // background queue.
        this.buildSceneSync(paragraphIndex - 1);
        this.buildSceneSync(paragraphIndex);
        this.buildSceneSync(paragraphIndex + 1);
        if (jumped) {
          // A seek invalidates any pending background work targeting other
          // paragraphs; the reschedule below repopulates the queue.
          this.buildingScenes.forEach((build, index) => {
            if (Math.abs(index - paragraphIndex) > 1) {
              build.container.destroy({ children: true });
              this.buildingScenes.delete(index);
              this.buildSchedule.delete(index);
            }
          });
        }
      }
      this.scheduleAroundActive(this.rebuildGeneration);
      this.pruneScenes(paragraphIndex);
      this.lastScheduledIndex = paragraphIndex;
    } else if (this.lastScheduledIndex !== paragraphIndex) {
      this.scheduleAroundActive(this.rebuildGeneration);
      this.lastScheduledIndex = paragraphIndex;
    }

    // Time-sliced background construction (bounded per frame).
    this.processBuildQueue(frameDeadline);

    const width = Math.max(this.options.host.clientWidth, 320);
    const height = Math.max(this.options.host.clientHeight, 240);
    const finalParagraph = this.options.program.paragraphs.at(-1);
    const creditsFrame = resolveSonnetCreditsFrame(
      time,
      finalParagraph?.endTime ?? Number.POSITIVE_INFINITY,
    );
    const hasCredits = this.creditsContainer.children.length > 0;

    this.sceneCache.forEach((record, index) => {
      const isActive = index === paragraphIndex;

      // Strict visibility: only the active scene is ever drawn. Zero overlap
      // between scenes. While a structural rebuild of the active paragraph is
      // in progress, its previous (stale-signature) scene remains in the cache
      // and keeps showing so the frame never goes blank; the finished scene
      // swaps in atomically when it is attached.
      record.scene.container.visible = isActive;
      if (!isActive) {
        // Keep inactive shot display trees warm. Pixi Text owns a GPU-backed
        // texture that can become blank after transient unload; scenes are
        // bounded to the active paragraph and are still fully unloaded when
        // pruned or destroyed.
        record.scene.activeShotIndex = -1;
        return;
      }

      const scene = record.scene;
      const transitionsEnabled =
        this.options.tuning.enableTransitions && !this.options.staticMode;
      const transitionSeed = hashSonnetSeed(
        `${this.options.program.seed}:${scene.paragraph.id}:transition-frame`,
      );
      const previousTransition =
        index > 0
          ? this.options.program.paragraphs[index - 1]?.transitionOut
          : null;
      const enterDuration = previousTransition
        ? Math.max(
            0.16,
            Math.min(
              0.3,
              previousTransition.endTime - previousTransition.startTime,
            ),
          )
        : 0;
      const entering =
        transitionsEnabled &&
        previousTransition !== null &&
        time >= scene.paragraph.startTime &&
        time <= scene.paragraph.startTime + enterDuration;
      const paragraphTransitionFrame = entering
        ? resolveSonnetEnterTransitionFrame(
            previousTransition.kind,
            time - scene.paragraph.startTime,
            enterDuration,
            true,
            transitionSeed,
          )
        : resolveSonnetExitTransitionFrame(
            scene.paragraph,
            time,
            transitionsEnabled,
            transitionSeed,
          );

      // Strictly determine the single active shot within this scene to avoid intra-scene residues
      let activeShotIndex = 0;
      for (let i = scene.shots.length - 1; i >= 0; i--) {
        if (time >= scene.shots[i].shot.startTime) {
          activeShotIndex = i;
          break;
        }
      }

      const visibleShotIndex = activeShotIndex;
      const shotTransitionFrame = resolveSonnetShotTransitionFrame(
        scene.shotTimeline,
        visibleShotIndex,
        time,
        transitionsEnabled,
        transitionSeed,
      );
      const transitionFrame =
        shotTransitionFrame !== IDLE_SONNET_TRANSITION_FRAME
          ? shotTransitionFrame
          : paragraphTransitionFrame;
      scene.shots.forEach((shot, shotIndex) => {
        const isShotActive = shotIndex === visibleShotIndex;
        shot.container.visible = isShotActive;
        if (!isShotActive) return;
        this.updateShot(shot, time, width, height, 0);
      });
      if (scene.activeShotIndex !== visibleShotIndex) {
        // Do not unload a reusable inactive shot here. Keeping its Text and
        // Graphics views warm prevents a later seek/transition from showing
        // a background-only frame; prune/destroy owns actual resource release.
        scene.activeShotIndex = visibleShotIndex;
      }
      // Publish the active shot so the dev overlay's Sonnet tab can inspect it.
      sonnetDebugState.activeShot =
        scene.shots[visibleShotIndex]?.debugInfo ?? null;
      sonnetDebugState.paragraphIndex = index;

      const isFinalScene = index === this.options.program.paragraphs.length - 1;
      const lyricAlpha =
        isFinalScene && hasCredits ? creditsFrame.lyricAlpha : 1;
      scene.container.alpha = transitionFrame.alpha * lyricAlpha;
      scene.container.pivot.set(width / 2, height / 2);
      scene.container.position.set(
        width / 2 + transitionFrame.x * width,
        height / 2 + transitionFrame.y * height,
      );
      scene.container.scale.set(transitionFrame.scale);
      scene.container.rotation = transitionFrame.rotation;
      if (scene.transitionBlurFilter) {
        scene.transitionBlurFilter.strength = transitionFrame.blur;
        scene.transitionBlurFilter.enabled = transitionFrame.blur > 0.01;
      }
      if (scene.transitionGlitchEffect) {
        scene.transitionGlitchEffect.update(
          transitionFrame.glitch,
          transitionFrame.glitchSeed,
        );
        scene.transitionGlitchEffect.filter.enabled =
          transitionFrame.glitch > 0.01;
      }

      if (isFinalScene && hasCredits) {
        this.updateOutroBlur(scene, creditsFrame.lyricBlur);
      }
    });

    if (!creditsFrame.active || !hasCredits) this.clearOutroBlur();
    this.creditsContainer.visible =
      creditsFrame.active && hasCredits && !this.options.tuning.showOnlyText;
    this.creditsContainer.alpha = creditsFrame.posterAlpha;
    this.creditsContainer.position.set(
      width / 2,
      height / 2 + creditsFrame.posterOffsetY * height,
    );
    this.creditsContainer.scale.set(creditsFrame.posterScale);
  };

  renderOnce() {
    if (this.destroyed || !this.app.canvas.isConnected) return;
    this.renderFrame();
    if (this.destroyed) return;
    this.app.renderer.render(this.app.stage);
  }

  setPaused(paused: boolean) {
    if (this.destroyed) return;
    this.options.paused = paused;
    if (paused || this.documentHidden) {
      this.app.stop();
      this.renderOnce();
    } else {
      this.renderOnce();
      this.app.start();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    sonnetDebugState.activeShot = null;
    sonnetDebugState.paragraphIndex = -1;
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.stop();
    this.app.ticker.remove(this.renderFrame);
    this.clearScenes();
    destroySonnetContainerChildren(this.creditsContainer);
    destroySonnetContainerChildren(this.overlayContainer);
    this.warmContainer.destroy({ children: true });
    this.iconTextures.clear();
    const texturePool = getSonnetTexturePool(this.pixi);
    this.iconUrls.forEach((url) => {
      texturePool.release(url);
    });
    this.iconUrls.clear();
    this.app.destroy({ removeView: true }, { children: true, texture: true });
  }
}
