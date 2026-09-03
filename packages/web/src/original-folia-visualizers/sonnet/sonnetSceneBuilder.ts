import type { SonnetTuning, Theme } from "../../types";
import {
  normalizeFontWeight,
  resolveThemeFontStack,
} from "../../utils/fontStacks";
import type { SonnetParagraph, SonnetShot } from "./types";
import { hashSonnetSeed } from "./sonnetRandom";
import { buildSonnetShotMg } from "./sonnetShotMg";
import {
  applySonnetScenePostProcess,
  createSonnetHaloLayer,
  resolveSonnetPostProcessProfile,
} from "./sonnetPostProcess";
import {
  isSonnetLayoutSegment,
  resolveSonnetTypographyLayout,
} from "./sonnetTypographyLayout";
import { buildSonnetTextView, type SegmentView } from "./sonnetTextViewBuilder";
import {
  createSonnetGlitchEffect,
  type SonnetGlitchEffect,
} from "./sonnetGlitchFilter";
import {
  buildSonnetMeasuredBoundsDebug,
  createSonnetShotDebugInfo,
  type SonnetDebugShotInfo,
} from "./sonnetDebug";
import { resolveSonnetGeoVariant } from "./sonnetSpatialMgGeometry";
import { resolveSonnetBackgroundMgVariant } from "./sonnetBackgroundMgVariants";
import { resolveSonnetBackgroundDecorVariant } from "./sonnetBackgroundDecor";
import { resolveSonnetFixedGeoVariant } from "./sonnetFixedGeoVariants";

// src/components/visualizer/sonnet/sonnetSceneBuilder.ts
// Builds one bounded paragraph scene. The scene build is incremental (one shot at
// a time) so the runtime can time-slice it across idle frames instead of blocking
// the ticker on a paragraph change; playback-time mutation stays in the runtime.
type PixiModule = typeof import("pixi.js");

export interface ShotView {
  shot: SonnetShot;
  container: import("pixi.js").Container;
  segments: SegmentView[];
  debugInfo: SonnetDebugShotInfo;
  baseX: number;
  baseY: number;
  basePivotX: number;
  basePivotY: number;
  haloLayer: import("pixi.js").Container;
  mgLayer: import("pixi.js").Container;
  mgBackgroundLayer?: import("pixi.js").Container;
  mgGeoLayer?: import("pixi.js").Container;
  mgParticleLayer?: import("pixi.js").Container;
  mgFixedGeoLayer?: import("pixi.js").Container;
}

export interface SceneView {
  paragraph: SonnetParagraph;
  container: import("pixi.js").Container;
  shots: ShotView[];
  shotTimeline: SonnetShot[];
  postProcessFilters: import("pixi.js").Filter[];
  transitionBlurFilter: import("pixi.js").BlurFilter | null;
  transitionGlitchEffect: SonnetGlitchEffect | null;
  activeShotIndex: number;
}

/**
 * Incremental scene build state. `stepSceneBuild` advances it by one shot per
 * call so the runtime can spread the cost over several frames; the incomplete
 * scene stays invisible and must not be shown until `completeSceneBuild`.
 */
export interface IncrementalSceneBuild {
  paragraph: SonnetParagraph;
  scene: SceneView;
  options: SonnetSceneBuildOptions;
  container: import("pixi.js").Container;
  fontFamily: string;
  manualFontWeight: number | null;
  postProcessProfile: ReturnType<typeof resolveSonnetPostProcessProfile>;
  showOnlyText: boolean;
  showBackgroundMg: boolean;
  showFixedGeo: boolean;
  showBackgroundDecor: boolean;
  showGuide: boolean;
  showOuterMetadata: boolean;
  sceneSeed: number;
  width: number;
  height: number;
  nextShotIndex: number;
  iconTextures: Map<string, import("pixi.js").Texture>;
  completed: boolean;
}

export interface SonnetSceneBuildOptions {
  programSeed: string;
  host: HTMLDivElement;
  theme: Theme;
  tuning: SonnetTuning;
  lyricsFontScale: number;
  staticMode: boolean;
}

const colorNumber = (pixi: PixiModule, color: string) =>
  pixi.Color.shared.setValue(color).toNumber();

/**
 * Starts a time-sliceable scene build: creates the scene container, background
 * layer and theme metadata, but none of the shots yet. Pair with repeated
 * `stepSceneBuild` calls and a final `completeSceneBuild`.
 */
export const startSceneBuild = (
  pixi: PixiModule,
  options: SonnetSceneBuildOptions,
  iconTextures: Map<string, import("pixi.js").Texture>,
  paragraph: SonnetParagraph,
): IncrementalSceneBuild => {
  const { Container, Graphics, Text, TextStyle } = pixi;
  const width = Math.max(options.host.clientWidth, 320);
  const height = Math.max(options.host.clientHeight, 240);
  const container = new Container();
  const sceneBackgroundLayer = new Container();
  // Resolve visibility once while building; playback only mutates animation state afterward.
  const showOnlyText = options.tuning.showOnlyText;
  const showBackgroundMg = !showOnlyText && options.tuning.showBackgroundMg;
  const showFixedGeo = !showOnlyText && options.tuning.showFixedGeo;
  const showBackgroundDecor =
    !showOnlyText && options.tuning.showBackgroundDecor;
  const showGuide = !showOnlyText && options.tuning.showGuide;
  const showOuterMetadata =
    !showOnlyText && options.tuning.outerFrameMode === "full";
  const sceneSeed = hashSonnetSeed(`${options.programSeed}:${paragraph.id}`);
  const postProcessProfile = resolveSonnetPostProcessProfile(
    options.theme,
    options.tuning,
    options.staticMode,
  );
  const fontFamily = resolveThemeFontStack(options.theme);
  const manualFontWeight = normalizeFontWeight(options.theme.fontWeight);

  if (showBackgroundMg) {
    const density = Math.round(4 + options.tuning.mgDensity * 5);
    sceneBackgroundLayer.addChild(
      new Graphics()
        .rect(0, 0, width, height)
        .fill({
          color: colorNumber(pixi, options.theme.backgroundColor),
          alpha: 0.1,
        }),
    );

    for (let index = 0; index < density; index += 1) {
      const x = (((sceneSeed + index * 97) % 997) / 997) * width;
      const y = (((sceneSeed + index * 193) % 991) / 991) * height;
      const length = 32 + ((sceneSeed + index * 43) % 180);
      sceneBackgroundLayer.addChild(
        new Graphics()
          .moveTo(x, y)
          .lineTo(Math.min(width, x + length), y)
          .stroke({
            color: colorNumber(
              pixi,
              index % 2
                ? options.theme.secondaryColor
                : options.theme.accentColor,
            ),
            width: index % 3 === 0 ? 2 : 1,
            alpha: 0.12 + (index % 4) * 0.04,
          }),
      );
    }
  }

  // Decorative theme metadata text
  if (options.theme.name) {
    const nameText = new Text({
      text: `[ THEME ] ${options.theme.name.toUpperCase()}`,
      style: new TextStyle({
        fontFamily,
        fontWeight:
          manualFontWeight === null
            ? "bold"
            : (String(
                manualFontWeight,
              ) as import("pixi.js").TextStyleFontWeight),
        fontSize: 14,
        fill: options.theme.primaryColor,
        letterSpacing: 4,
      }),
    });
    nameText.alpha = 0.2;
    nameText.rotation = -Math.PI / 2;
    nameText.position.set(20, height - 20);
    nameText.anchor.set(0, 1);
    if (showOuterMetadata) sceneBackgroundLayer.addChild(nameText);
  }

  if (options.theme.description) {
    const descText = new Text({
      text: options.theme.description,
      style: new TextStyle({
        fontFamily,
        fontWeight:
          manualFontWeight === null
            ? undefined
            : (String(
                manualFontWeight,
              ) as import("pixi.js").TextStyleFontWeight),
        fontSize: 12,
        fill: options.theme.secondaryColor,
        wordWrap: true,
        wordWrapWidth: width * 0.3,
      }),
    });
    descText.alpha = 0.3;
    descText.position.set(width - 20, 20);
    descText.anchor.set(1, 0);
    if (showOuterMetadata) sceneBackgroundLayer.addChild(descText);
  }
  container.addChild(sceneBackgroundLayer);
  container.visible = false;

  const scene: SceneView = {
    paragraph,
    container,
    shots: [],
    shotTimeline: [],
    postProcessFilters: [],
    transitionBlurFilter: null,
    transitionGlitchEffect: null,
    activeShotIndex: -1,
  };

  return {
    paragraph,
    scene,
    options,
    container,
    fontFamily,
    manualFontWeight,
    postProcessProfile,
    showOnlyText,
    showBackgroundMg,
    showFixedGeo,
    showBackgroundDecor,
    showGuide,
    showOuterMetadata,
    sceneSeed,
    width,
    height,
    nextShotIndex: 0,
    iconTextures,
    completed: false,
  };
};

/**
 * Builds the shot at `nextShotIndex` (all its MG layers, glyph Text views and
 * guides) and appends it to the scene. Returns true when every shot is built.
 */
export const stepSceneBuild = (
  pixi: PixiModule,
  build: IncrementalSceneBuild,
): boolean => {
  if (build.completed) return true;
  const shotIndex = build.nextShotIndex;
  const shot = build.paragraph.shots[shotIndex];
  if (!shot) {
    build.completed = true;
    return true;
  }

  const { container, scene } = build;
  const { options } = build;
  const width = build.width;
  const height = build.height;
  const shotContainer = new pixi.Container();
  const compiledLines = shot.lineIndices
    .map((lineIndex) =>
      build.paragraph.lines.find((item) => item.sourceIndex === lineIndex),
    )
    .filter(Boolean) as SonnetParagraph["lines"];
  const linesSegments = compiledLines
    .map((line) => line.segments.filter(isSonnetLayoutSegment))
    .filter((segs) => segs.length > 0);
  const segments = linesSegments.flat();
  const wordCount = Math.max(
    1,
    segments.filter((segment) => segment.isWordLike).length,
  );
  const heroScale =
    shot.kind === "type-impact"
      ? 1.55
      : shot.kind === "quiet-tableau"
        ? 0.82
        : 1;
  const fontSize = Math.max(
    24,
    Math.min(
      112,
      (width / Math.max(7, wordCount * 2.15)) *
        heroScale *
        options.lyricsFontScale,
    ),
  );
  const views: SegmentView[] = [];
  const placements = resolveSonnetTypographyLayout({
    lines: linesSegments,
    shotKind: shot.kind,
    paragraphKind: build.paragraph.kind,
    width,
    height,
    baseFontSize: fontSize,
    fontFamily: build.fontFamily,
    fontWeight: build.manualFontWeight,
  });
  const shotSeed = build.sceneSeed + shotIndex * 97;
  const mgLayer = buildSonnetShotMg(
    pixi,
    shot.kind,
    options.theme,
    width,
    height,
    shotSeed,
    build.iconTextures,
  );
  shotContainer.addChild(mgLayer);
  const mgBackgroundLayer = (mgLayer as any).bgLayer as
    import("pixi.js").Container | undefined;
  const mgGeoLayer = (mgLayer as any).geoLayer as
    import("pixi.js").Container | undefined;
  const mgParticleLayer = (mgLayer as any).particleLayer as
    import("pixi.js").Container | undefined;
  const mgFixedGeoLayer = (mgLayer as any).fixedGeoLayer as
    import("pixi.js").Container | undefined;
  mgLayer.visible =
    build.showBackgroundMg || build.showFixedGeo || build.showBackgroundDecor;
  if (mgBackgroundLayer) mgBackgroundLayer.visible = build.showBackgroundMg;
  if (mgGeoLayer) mgGeoLayer.visible = build.showBackgroundMg;
  if (mgParticleLayer) mgParticleLayer.visible = build.showBackgroundDecor;
  if (mgFixedGeoLayer) mgFixedGeoLayer.visible = build.showFixedGeo;
  const { layer: haloLayer, filters: haloFilters } = createSonnetHaloLayer(
    pixi,
    build.postProcessProfile,
  );
  const guideLayer = new pixi.Container();
  const textLayer = new pixi.Container();
  guideLayer.visible = build.showGuide;
  haloLayer.visible = !build.showOnlyText;
  shotContainer.addChild(guideLayer, haloLayer, textLayer);
  scene.postProcessFilters.push(...haloFilters);
  // Virtual instrumental lines can share one shot; the complete staff belongs to the shot, not each line.
  let staffViewAdded = false;
  placements.forEach((placement, placementIndex) => {
    const segment = segments[placement.segmentIndex];
    if (segment.text === "♪") {
      if (staffViewAdded) return;
      staffViewAdded = true;
    }
    views.push(
      buildSonnetTextView(pixi, {
        segment,
        placement,
        segmentIndex: placement.segmentIndex,
        baseFontSize: fontSize,
        shotStartTime: shot.startTime,
        shotEndTime: shot.endTime,
        paragraphKind: build.paragraph.kind,
        width,
        fontFamily: build.fontFamily,
        fontWeight: build.manualFontWeight,
        theme: options.theme,
        glowEnabled: build.postProcessProfile.glowStrength > 0,
        showFixedGeo: build.showFixedGeo,
        guideLayer,
        haloLayer,
        textLayer,
      }),
    );
    void placementIndex;
  });
  const bounds = shotContainer.getLocalBounds();
  // `mask-reveal` is revealed by the glyph timeline. A bounds-sized mask would stay
  // static while camera tracking and parallax move the shot, clipping open MG artwork.
  // Debug overlay stays above the text and never feeds the bounds/focus math.
  shotContainer.addChild(buildSonnetMeasuredBoundsDebug(pixi, placements));
  const usesGeoMg =
    shot.kind === "type-impact" || shot.kind === "fragment-collage";
  const debugInfo = createSonnetShotDebugInfo({
    programSeed: options.programSeed,
    paragraphId: build.paragraph.id,
    paragraphKind: build.paragraph.kind,
    shot,
    shotIndex,
    shotCount: build.paragraph.shots.length,
    baseFontSize: fontSize,
    wordCount,
    geoVariant: usesGeoMg ? resolveSonnetGeoVariant(shotSeed) : null,
    backgroundMgVariant: resolveSonnetBackgroundMgVariant(shotSeed),
    fixedGeoVariant: usesGeoMg ? resolveSonnetFixedGeoVariant(shotSeed) : null,
    backgroundDecorVariant: resolveSonnetBackgroundDecorVariant(shotSeed),
    placements,
    segmentTexts: segments.map((segment) => segment.text),
  });

  // Poster blocks start centered before runtime tracking; other templates start on the hero word.
  const heroPlacement = placements.find((p) => p.role === "hero");
  const focusX =
    shot.kind === "poster-blocks"
      ? 0
      : heroPlacement
        ? heroPlacement.x
        : bounds.x + bounds.width / 2;
  const focusY =
    shot.kind === "poster-blocks"
      ? 0
      : heroPlacement
        ? heroPlacement.y
        : bounds.y + bounds.height / 2;

  shotContainer.pivot.set(focusX, focusY);
  shotContainer.position.set(
    width * (shot.kind === "poster-blocks" ? 0.5 : 0.5 + shot.camera.x),
    height *
      (shot.kind === "poster-blocks"
        ? 0.5
        : 0.48 + shot.camera.y + (shotIndex % 2 ? 0.025 : -0.025)),
  );
  container.addChild(shotContainer);

  const shotView: ShotView = {
    shot,
    container: shotContainer,
    segments: views,
    debugInfo,
    baseX: shotContainer.x,
    baseY: shotContainer.y,
    basePivotX: focusX,
    basePivotY: focusY,
    haloLayer,
    mgLayer,
    mgBackgroundLayer,
    mgGeoLayer,
    mgParticleLayer,
    mgFixedGeoLayer,
  };
  scene.shots.push(shotView);
  scene.shotTimeline.push(shot);

  build.nextShotIndex = shotIndex + 1;
  if (build.nextShotIndex >= build.paragraph.shots.length) {
    build.completed = true;
    return true;
  }
  return false;
};

/**
 * Attaches scene-wide post-process and transition filters after every shot has
 * been built. The returned scene is ready to display.
 */
export const completeSceneBuild = (
  pixi: PixiModule,
  build: IncrementalSceneBuild,
): SceneView => {
  const { container, scene, options, sceneSeed, width, height } = build;

  if (!build.showOnlyText) {
    const sceneFilters = applySonnetScenePostProcess(
      pixi,
      container,
      build.postProcessProfile,
      sceneSeed,
    );
    if (sceneFilters.length > 0) {
      // Keep full-scene shaders in viewport space even when visible lyric/decor bounds are smaller.
      container.filterArea = new pixi.Rectangle(0, 0, width, height);
      scene.postProcessFilters.push(...sceneFilters);
    }
  }
  const transitionBlurFilter =
    options.tuning.enableTransitions && !options.staticMode
      ? new pixi.BlurFilter({
          strength: 0,
          quality: 1,
          kernelSize: 5,
          resolution: 0.5,
        })
      : null;
  if (transitionBlurFilter) {
    transitionBlurFilter.enabled = false;
    container.filters = [...(container.filters ?? []), transitionBlurFilter];
    scene.postProcessFilters.push(transitionBlurFilter);
  }
  const transitionGlitchEffect =
    options.tuning.enableTransitions && !options.staticMode
      ? createSonnetGlitchEffect(pixi)
      : null;
  if (transitionGlitchEffect) {
    container.filters = [
      ...(container.filters ?? []),
      transitionGlitchEffect.filter,
    ];
    scene.postProcessFilters.push(transitionGlitchEffect.filter);
  }
  container.visible = false;
  build.completed = true;
  return scene;
};

/**
 * Convenience: builds a whole scene synchronously. Used by seek/startup paths
 * where the scene must exist before the next frame is presented; steady-state
 * playback builds scenes incrementally via the three functions above.
 */
export const buildSonnetScene = (
  pixi: PixiModule,
  options: SonnetSceneBuildOptions,
  iconTextures: Map<string, import("pixi.js").Texture>,
  paragraph: SonnetParagraph,
): SceneView => {
  const build = startSceneBuild(pixi, options, iconTextures, paragraph);
  while (!stepSceneBuild(pixi, build)) {
    // Keep building until complete.
  }
  return completeSceneBuild(pixi, build);
};
