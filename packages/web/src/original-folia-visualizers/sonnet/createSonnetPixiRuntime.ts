import type { MotionValue } from 'framer-motion';
import type { AudioBands, SonnetTuning, Theme } from '../../types';
import type { SonnetProgram } from './types';
import { findSonnetParagraphIndexAtTime } from './sonnetProgram';
import { buildSonnetIconDataUrl, buildSonnetIconTextureKey, resolveSonnetIconNames } from './sonnetIcons';
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
} from './sonnetMotion';
import { hashSonnetSeed } from './sonnetRandom';
import {
    IDLE_SONNET_TRANSITION_FRAME,
    resolveSonnetEnterTransitionFrame,
    resolveSonnetExitTransitionFrame,
    resolveSonnetShotTransitionFrame,
} from './sonnetTransitions';
import { buildSonnetScene, type SceneView, type ShotView } from './sonnetSceneBuilder';
import { isSonnetEmphasisRole } from './sonnetTypographyLayout';
import { getSonnetTexturePool } from './sonnetTexturePool';
import type { StagePerformanceTier } from '../../utils/stagePerformance';
import { snapResolutionToTexturePool } from '../pixiTextureBudget';
import {
    destroySonnetContainerChildren,
    destroySonnetDisplayTree,
    unloadSonnetDisplayTree,
} from './sonnetPixiResources';
import {
    buildSonnetCreditsPoster,
    hasSonnetCreditsMetadata,
    resolveSonnetCreditsFrame,
} from './sonnetCredits';
import { sonnetDebugState } from './sonnetDebug';
import { resolveSonnetSegmentCameraFocus } from './sonnetCameraTracking';
import { SONNET_SONG_SWAP_MS, resolveSonnetHandoverFrame } from './songHandover';
import { probeCount, probeSpan, stageNow } from '../../utils/stageProbe';

// src/components/visualizer/sonnet/createSonnetPixiRuntime.ts
// Owns Pixi lifecycle and mutates bounded scene views directly from absolute playback time.
type PixiModule = typeof import('pixi.js');

/**
 * Sonnet's scene is animation-driven, so a bounded ticker avoids spending a full Pixi frame on work
 * the display cannot present. This is the only thing the adaptive performance tier is allowed to
 * change while a runtime is alive.
 */
const resolveSonnetTickerMaxFps = (tier: StagePerformanceTier | undefined): number => (
    tier === 'compact' ? 30 : tier === 'balanced' ? 45 : 60
);

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
    performanceTier?: StagePerformanceTier;
    songTitle?: string | null;
    songArtist?: string | null;
    songAlbum?: string | null;
    signal?: AbortSignal;
}

export class SonnetPixiRuntime {
    private readonly sceneCache = new Map<number, SceneView>();
    private readonly iconTextures = new Map<string, import('pixi.js').Texture>();
    private readonly iconUrls = new Set<string>();
    private activeParagraphIndex = -1;
    private destroyed = false;
    /** Guards the async icon swap: only the newest theme's textures are ever adopted. */
    private iconGeneration = 0;
    private resizeObserver: ResizeObserver | null = null;
    private lastWidth = 0;
    private lastHeight = 0;

    private sceneContainer!: import('pixi.js').Container;
    /**
     * Holds the outgoing picture for the length of a song handover. It sits above the scene
     * container (the incoming picture fades in underneath it) and below the credits/overlay
     * layers, which must stay on top of both.
     */
    private handoverContainer!: import('pixi.js').Container;
    private handoverScene: SceneView | null = null;
    private handoverStartedAt = 0;
    private creditsContainer!: import('pixi.js').Container;
    private overlayContainer!: import('pixi.js').Container;
    private outroBlurFilter: import('pixi.js').BlurFilter | null = null;
    private outroBlurScene: SceneView | null = null;

    private constructor(
        private readonly pixi: PixiModule,
        private readonly options: SonnetRuntimeOptions,
        private readonly app: import('pixi.js').Application,
    ) { }

    static async create(options: SonnetRuntimeOptions) {
        const pixi = await import('pixi.js');
        const app = new pixi.Application();
        const width = Math.max(options.host.clientWidth, 320);
        const height = Math.max(options.host.clientHeight, 240);
        await app.init({
            width,
            height,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: snapResolutionToTexturePool(width, height, options.tuning.textureResolution),
            autoStart: false,
            sharedTicker: false,
            preference: 'webgl',
            powerPreference: 'high-performance',
        });
        const runtime = new SonnetPixiRuntime(pixi, options, app);
        runtime.sceneContainer = new pixi.Container();
        runtime.handoverContainer = new pixi.Container();
        runtime.creditsContainer = new pixi.Container();
        runtime.overlayContainer = new pixi.Container();
        app.stage.addChild(
            runtime.sceneContainer,
            runtime.handoverContainer,
            runtime.creditsContainer,
            runtime.overlayContainer,
        );

        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Sonnet runtime creation was cancelled', 'AbortError');
        }
        options.host.appendChild(app.canvas);
        app.canvas.style.cssText = 'width:100%;height:100%;display:block';
        await runtime.preloadIcons();
        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Sonnet runtime creation was cancelled', 'AbortError');
        }
        runtime.install();
        return runtime;
    }

    private install() {
        this.resizeToHost();
        this.app.ticker.maxFPS = resolveSonnetTickerMaxFps(this.options.performanceTier);
        this.app.ticker.add(this.renderFrame);
        this.resizeObserver = new ResizeObserver(() => {
            if (this.destroyed || !this.resizeToHost()) return;
            if (this.options.paused) this.renderOnce();
        });
        this.resizeObserver.observe(this.options.host);
        this.renderOnce();
        if (!this.options.paused) this.app.start();
    }

    private resizeToHost() {
        if (this.destroyed) return false;
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);
        if (width === this.lastWidth && height === this.lastHeight) return false;
        this.lastWidth = width;
        this.lastHeight = height;
        // A picture staged for a dissolve was sized for the old viewport: let it go rather than
        // letting it stretch over the new one.
        this.releaseHandover(true);
        probeCount('sonnet.resize');
        // Full-viewport filter targets use Pixi's power-of-two texture pool. Keep the canvas
        // just below a bucket edge where possible to avoid paying for mostly empty filter textures.
        this.app.renderer.resize(
            width,
            height,
            snapResolutionToTexturePool(width, height, this.options.tuning.textureResolution),
        );
        this.clearScenes();
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
        this.creditsContainer.addChild(buildSonnetCreditsPoster(
            this.pixi,
            this.options.theme,
            metadata,
            width,
            height,
            this.options.lyricsFontScale,
        ));
        this.creditsContainer.pivot.set(width / 2, height / 2);
        this.creditsContainer.position.set(width / 2, height / 2);
        this.creditsContainer.visible = false;
    }

    setSongMetadata(metadata: SonnetSongMetadata) {
        if (this.destroyed) return;
        const changed = this.options.songTitle !== metadata.title
            || this.options.songArtist !== metadata.artist
            || this.options.songAlbum !== metadata.album;
        if (!changed) return;

        this.options.songTitle = metadata.title;
        this.options.songArtist = metadata.artist;
        this.options.songAlbum = metadata.album;
        if (this.lastWidth > 0 && this.lastHeight > 0) {
            this.drawCredits(this.lastWidth, this.lastHeight);
            if (this.options.paused) this.renderOnce();
        }
    }

    private clearOutroBlur() {
        if (this.outroBlurFilter && this.outroBlurScene) {
            this.outroBlurScene.container.filters = (this.outroBlurScene.container.filters ?? [])
                .filter(filter => filter !== this.outroBlurFilter);
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
            scene.container.filters = [...(scene.container.filters ?? []), this.outroBlurFilter];
            this.outroBlurScene = scene;
        }
        this.outroBlurFilter.strength = strength;
    }

    private drawOverlay(width: number, height: number) {
        destroySonnetContainerChildren(this.overlayContainer);
        if (this.options.tuning.showOnlyText || this.options.tuning.outerFrameMode === 'none') return;
        const g = new this.pixi.Graphics();

        const paddingX = Math.max(30, width * 0.05);
        const paddingY = Math.max(30, height * 0.05);

        const primary = this.pixi.Color.shared.setValue(this.options.theme.primaryColor).toNumber();
        const alpha = 0.5;

        // Asymmetrical, partial perimeter (Not enclosing the whole screen)
        // 1. Top-Left cluster
        g.rect(paddingX, paddingY, 30, 4).fill({ color: primary, alpha: 0.8 }); // Thick bar
        g.moveTo(paddingX, paddingY + 16).lineTo(paddingX, paddingY + 120).stroke({ color: primary, width: 1, alpha }); // Dropping line

        // 2. Bottom-Right cluster
        g.rect(width - paddingX - 4, height - paddingY - 16, 4, 16).fill({ color: primary, alpha: 0.8 }); // Thick vertical bar
        g.moveTo(width - paddingX - 160, height - paddingY).lineTo(width - paddingX - 20, height - paddingY).stroke({ color: primary, width: 1, alpha }); // Horizontal line
        g.moveTo(width - paddingX, height - paddingY - 180).lineTo(width - paddingX, height - paddingY - 30).stroke({ color: primary, width: 1, alpha }); // Rising line

        // 3. Floating accents
        const drawCross = (cx: number, cy: number, size: number) => {
            g.moveTo(cx - size, cy).lineTo(cx + size, cy).stroke({ color: primary, width: 1, alpha: 0.8 });
            g.moveTo(cx, cy - size).lineTo(cx, cy + size).stroke({ color: primary, width: 1, alpha: 0.8 });
        };
        // Top-Right cross
        drawCross(width - paddingX, paddingY + 20, 6);

        // Bottom-Left diamond
        g.moveTo(paddingX, height - paddingY - 4).lineTo(paddingX + 4, height - paddingY).lineTo(paddingX, height - paddingY + 4).lineTo(paddingX - 4, height - paddingY).fill({ color: primary, alpha: 0.7 });

        // Typographic star ✦
        const starStyle = new this.pixi.TextStyle({
            fontFamily: 'sans-serif',
            fontSize: 12,
            fill: primary,
        });
        const starText = new this.pixi.Text({ text: '✦', style: starStyle });
        starText.alpha = 0.6;
        starText.position.set(width - paddingX - 10, height - paddingY);
        starText.anchor.set(1, 0.5);

        this.overlayContainer.addChild(g, starText);
    }

    /**
     * Acquires the icon textures a theme asks for, without touching the live maps: a theme change
     * warms the incoming theme while the outgoing one is still rendering, and only adopts them once
     * they are ready (see `reloadIcons`).
     */
    private async acquireIcons(theme: Theme) {
        const textures = new Map<string, import('pixi.js').Texture>();
        const urls = new Set<string>();
        if (this.options.tuning.showOnlyText || !this.options.tuning.showBackgroundDecor) {
            return { textures, urls };
        }
        const names = resolveSonnetIconNames(theme.lyricsIcons);
        const resolution = this.options.tuning.textureResolution;
        const texturePool = getSonnetTexturePool(this.pixi);
        await Promise.all(names.map(async (name, index) => {
            const size = 192 + (index % 4) * 32;
            const colors = [
                theme.accentColor,
                theme.secondaryColor,
                theme.primaryColor,
            ];
            const color = colors[index % colors.length];
            const key = buildSonnetIconTextureKey(name, color, 3.5, size, resolution);
            const url = buildSonnetIconDataUrl(name, color, 3.5, size);
            if (!url) return;
            try {
                textures.set(key, await texturePool.acquire(url));
                urls.add(url);
            } catch {
                // Invalid theme icons are optional; geometric MG remains available.
            }
        }));
        return { textures, urls };
    }

    /** Hands every icon url this runtime holds back to the pool. Refcounted, so order does not matter. */
    private releaseIcons() {
        const texturePool = getSonnetTexturePool(this.pixi);
        this.iconTextures.clear();
        this.iconUrls.forEach(url => {
            texturePool.release(url);
        });
        this.iconUrls.clear();
    }

    private async preloadIcons() {
        const loaded = await this.acquireIcons(this.options.theme);
        loaded.textures.forEach((texture, key) => this.iconTextures.set(key, texture));
        loaded.urls.forEach(url => this.iconUrls.add(url));
    }

    /**
     * Swaps the decorative icon layer over to a new theme without tearing the context down, then
     * drops the scene cache so scenes built with the old icons are re-laid-out with the new ones.
     * A stale generation simply releases what it fetched - the same acquire-then-release discipline
     * the upstream song handover uses.
     */
    private async reloadIcons() {
        const generation = (this.iconGeneration += 1);
        this.releaseIcons();
        const loaded = await this.acquireIcons(this.options.theme);
        if (this.destroyed || generation !== this.iconGeneration) {
            const texturePool = getSonnetTexturePool(this.pixi);
            loaded.urls.forEach(url => texturePool.release(url));
            return;
        }
        loaded.textures.forEach((texture, key) => this.iconTextures.set(key, texture));
        loaded.urls.forEach(url => this.iconUrls.add(url));
        this.clearScenes();
        if (this.options.paused) this.renderOnce();
    }

    private clearScenes() {
        this.clearOutroBlur();
        this.sceneCache.forEach(scene => {
            this.destroyScene(scene);
        });
        this.sceneCache.clear();
        this.activeParagraphIndex = -1;
    }
    private destroyScene(scene: SceneView) {
        if (this.outroBlurScene === scene) this.clearOutroBlur();
        // Parent-agnostic: a scene handed to the handover container is no longer a child of the
        // scene container, and Pixi's removeChild throws for a child it does not own.
        scene.container.parent?.removeChild(scene.container);
        unloadSonnetDisplayTree(scene.container);
        scene.container.filters = null;
        scene.shots.forEach(shot => {
            shot.haloLayer.filters = null;
        });
        scene.postProcessFilters.forEach(filter => filter.destroy());
        // destroy({ children: true }) leaves Pixi 8 GraphicsContext buffers for delayed GC.
        destroySonnetDisplayTree(scene.container);
    }

    private ensureScene(index: number) {
        if (index < 0 || index >= this.options.program.paragraphs.length) return null;
        const cached = this.sceneCache.get(index);
        if (cached) {
            probeCount('sonnet.scene.hit');
            return cached;
        }
        const startedAt = stageNow();
        const scene = buildSonnetScene(this.pixi, {
            programSeed: this.options.program.seed,
            host: this.options.host,
            theme: this.options.theme,
            tuning: this.options.tuning,
            lyricsFontScale: this.options.lyricsFontScale,
            staticMode: this.options.staticMode,
        }, this.iconTextures, this.options.program.paragraphs[index]);
        probeSpan('sonnet.sceneBuild', stageNow() - startedAt);
        this.sceneCache.set(index, scene);
        this.sceneContainer.addChild(scene.container);
        return scene;
    }

    /**
     * Starts a song handover: the picture currently on screen is moved out of the scene container
     * into the handover container so it can fade out while the incoming program builds its first
     * scene. Upstream's `songHandover.ts` exists for exactly this - a track change should dissolve,
     * not cut to an empty frame for the length of the new paragraph's layout.
     */
    private beginHandover() {
        const index = this.activeParagraphIndex;
        const outgoing = index >= 0 ? this.sceneCache.get(index) : undefined;
        // A dissolve still in flight is replaced, not stacked: destroy the older picture first.
        this.releaseHandover(true);
        if (!outgoing || !outgoing.container.parent) {
            this.sceneContainer.alpha = 1;
            return;
        }
        // Leave the cache before clearScenes() runs: everything still in there gets destroyed.
        this.sceneCache.delete(index);
        outgoing.container.parent.removeChild(outgoing.container);
        this.handoverContainer.addChild(outgoing.container);
        outgoing.container.alpha = 1;
        this.handoverScene = outgoing;
        this.handoverStartedAt = stageNow();
        this.sceneContainer.alpha = 0;
        probeCount('sonnet.handover');
    }

    private advanceHandover() {
        if (!this.handoverScene) {
            if (this.sceneContainer.alpha !== 1) this.sceneContainer.alpha = 1;
            return;
        }
        const frame = resolveSonnetHandoverFrame(stageNow() - this.handoverStartedAt, SONNET_SONG_SWAP_MS);
        this.handoverScene.container.alpha = frame.outgoingAlpha;
        this.sceneContainer.alpha = frame.incomingAlpha;
        if (frame.done) this.releaseHandover(true);
    }

    /** Drops the outgoing picture, leaving the incoming one fully visible. */
    private releaseHandover(destroyScene: boolean) {
        const scene = this.handoverScene;
        this.handoverScene = null;
        if (scene) {
            if (scene.container.parent === this.handoverContainer) {
                this.handoverContainer.removeChild(scene.container);
            }
            if (destroyScene) this.destroyScene(scene);
        }
        this.sceneContainer.alpha = 1;
    }

    private pruneScenes(index: number) {
        this.sceneCache.forEach((scene, sceneIndex) => {
            if (Math.abs(sceneIndex - index) <= 1) return;
            this.destroyScene(scene);
            this.sceneCache.delete(sceneIndex);
            probeCount('sonnet.scene.pruned');
        });
    }

    private updateShot(view: ShotView, time: number, width: number, height: number, shakeIntensity: number) {
        const progress = resolveShotProgress(view.shot, time);
        const motion = this.options.tuning.typographyMotion * resolveSonnetAnimationScale(this.options.theme);
        const camera = this.options.tuning.cameraIntensity * resolveSonnetAnimationScale(this.options.theme);
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

        let trackSegments = view.segments.filter(s => s.role !== 'decoration' && s.trackingGlyphs.length > 0);
        if (trackSegments.length === 0) {
            trackSegments = view.segments.filter(s => s.trackingGlyphs.length > 0);
        }

        // Layer a deterministic breathing float once the lyric reveal completes, so the
        // frame never goes fully static while the shot holds or drifts through a gap.
        const revealDoneTime = trackSegments.length > 0
            ? Math.max(...trackSegments.map(segment => segment.trackingGlyphs.at(-1)?.startTime ?? view.shot.endTime))
            : view.shot.endTime;
        const breathWeight = resolveSonnetBreathWeight(time, revealDoneTime);
        if (breathWeight > 0) {
            const breathPhase = (hashSonnetSeed(view.shot.id) % 1024) / 1024 * Math.PI * 2;
            const breath = resolveSonnetCameraBreath(time, breathPhase);
            cameraFrame.x += breath.x * breathWeight;
            cameraFrame.y += breath.y * breathWeight;
            cameraFrame.scale += breath.scale * breathWeight;
            cameraFrame.rotation += breath.rotation * breathWeight;
        }

        let currentFocusX = view.basePivotX;
        let currentFocusY = view.basePivotY;

        if (trackSegments.length > 0) {
            const focusRanges = trackSegments.map(segment => ({
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
                    const pos = resolveSonnetSegmentCameraFocus(seg.trackingGlyphs, focusTime);
                    focusX += pos.x * weight;
                    focusY += pos.y * weight;
                }
                return { x: focusX, y: focusY };
            };
            const focusTime = Math.max(view.shot.startTime, Math.min(time, view.shot.endTime));
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
            view.basePivotY + (currentFocusY - view.basePivotY) * camera
        );

        view.container.scale.set(
            view.shot.camera.zoom
            * (1 + (cameraFrame.scale - 1) * camera),
        );
        view.container.rotation = (
            view.shot.camera.rotation + cameraFrame.rotation + shake.rotation
        ) * camera;
        view.container.x = view.baseX + (cameraFrame.x * width + shake.x * width) * camera;
        view.container.y = view.baseY + (cameraFrame.y * height + shake.y * height) * camera;

        if (view.mgParticleLayer) {
            // Create a slight time-difference/parallax effect for decorative elements
            const particleParallaxX = (cameraFrame.x * width + shake.x * width) * camera * 0.4;
            const particleParallaxY = (cameraFrame.y * height + shake.y * height) * camera * 0.4;
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

        view.segments.forEach(segmentView => {
            const guide = segmentView.guide;
            const guideActive = time >= guide.startTime && time <= guide.endTime;
            guide.container.visible = guideActive && this.options.tuning.showGuide && !this.options.tuning.showOnlyText;
            if (guideActive) {
                const guideProgress = clamp01(
                    (time - guide.startTime) / Math.max(0.001, guide.endTime - guide.startTime),
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
                const frameVisible = this.options.tuning.showFixedGeo && !this.options.tuning.showOnlyText;
                frameDecor.container.visible = frameVisible;
                if (frameVisible) {
                    frameDecor.update(clamp01(
                        (time - frameDecor.startTime) / Math.max(0.001, frameDecor.endTime - frameDecor.startTime),
                    ));
                }
            }

            segmentView.glyphs.forEach(glyph => {
                const glyphProgress = resolveSegmentProgress(
                    glyph.startTime,
                    glyph.settleTime,
                    time,
                );
                const waiting = time < glyph.startTime;
                const offset = (1 - glyphProgress) * motion;
                const coreAlpha = waiting ? 0 : 0.16 + glyphProgress * 0.84;
                const haloAlpha = waiting ? 0 : 1 - glyphProgress * 0.28;
                const scale = isSonnetEmphasisRole(segmentView.role) && view.shot.kind === 'type-impact'
                    ? 0.52 + glyphProgress * 0.48
                    : 0.86 + glyphProgress * 0.14;
                const x = glyph.baseX + glyph.enterX * offset;
                const y = glyph.baseY + glyph.enterY * offset;
                const rotation = glyph.finalRotation + glyph.entryRotation * offset;
                const isGiantDecorativeText = segmentView.role === 'decoration';
                const showTextGlyph = glyph.isTextGlyph !== false;
                const glyphVisible = this.options.tuning.showOnlyText
                    ? showTextGlyph && (!isGiantDecorativeText || this.options.tuning.showGiantDecorativeText)
                    : (!glyph.isBackgroundShape || this.options.tuning.showBackgroundDecor)
                        && (!isGiantDecorativeText || this.options.tuning.showGiantDecorativeText);

                // Simulated Parallax 3D effect
                const depth = glyph.zDepth || 0;
                // Move faster/slower than camera
                const parallaxX = (cameraFrame.x * width + shake.x * width) * camera * depth * 2.5;
                const parallaxY = (cameraFrame.y * height + shake.y * height) * camera * depth * 2.5;
                // Scale larger if closer to camera (positive depth)
                const depthScale = 1 + depth * 0.45;

                glyph.display.alpha = coreAlpha;
                glyph.display.visible = glyphVisible;
                glyph.display.scale.set(scale * depthScale);
                glyph.display.position.set(x + parallaxX, y + parallaxY);
                glyph.display.rotation = rotation;
                const decorativeGlyphEffectsEnabled = this.options.performanceTier === 'full';
                if (glyph.halo) {
                    glyph.halo.visible = decorativeGlyphEffectsEnabled && glyphVisible;
                    if (decorativeGlyphEffectsEnabled) {
                        glyph.halo.alpha = haloAlpha;
                        glyph.halo.scale.set(scale * (1.08 - glyphProgress * 0.08));
                        glyph.halo.position.set(x, y);
                        glyph.halo.rotation = rotation;
                    }
                }

                // Keep all screen-blended aberration copies in the shared layer to preserve Pixi batching.
                if (glyph.caWrapper && glyph.caCyan && glyph.caRed && glyph.caOffset) {
                    const ca = glyph.caWrapper;
                    ca.visible = decorativeGlyphEffectsEnabled && glyphVisible && !this.options.tuning.showOnlyText;
                    ca.alpha = coreAlpha;
                    ca.scale.copyFrom(glyph.display.scale);
                    ca.position.copyFrom(glyph.display.position);
                    ca.rotation = rotation;
                    if (decorativeGlyphEffectsEnabled) {
                        const mergeEased = easeSonnetInOut(glyphProgress);
                        const currentOffset = glyph.caOffset * (1 - mergeEased * 0.8);
                        glyph.caCyan.position.set(-currentOffset, currentOffset * 0.5);
                        glyph.caRed.position.set(currentOffset, -currentOffset * 0.5);
                    }
                }

                // Semi-hero echo ghosts are optional decoration and are skipped on compact mobile.
                if (decorativeGlyphEffectsEnabled && glyph.ghosts && glyph.ghostDuration) {
                    const ghostProgress = clamp01((time - glyph.startTime) / glyph.ghostDuration);
                    const ghostActive = glyphVisible && ghostProgress > 0 && ghostProgress < 1;
                    // Quick fade-in, then a squared falloff so the echo dies fast.
                    const envelope = ghostProgress <= 0.2
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

                glyph.updateAnimation?.(time);
            });
        });
    }

    private renderFrame = () => {
        if (this.destroyed) return;
        const startedAt = stageNow();
        // The dissolve advances first and outside the program guard: a handover must be able to
        // finish even if the incoming program turns out to have nothing to draw.
        this.advanceHandover();
        this.renderFrameBody();
        probeSpan('sonnet.renderFrame', stageNow() - startedAt);
    };

    private renderFrameBody() {
        if (this.options.program.paragraphs.length === 0) {
            sonnetDebugState.activeShot = null;
            sonnetDebugState.paragraphIndex = -1;
            return;
        }
        const time = this.options.currentTime.get();
        const paragraphIndex = findSonnetParagraphIndexAtTime(this.options.program, time);
        if (paragraphIndex !== this.activeParagraphIndex) {
            this.activeParagraphIndex = paragraphIndex;
            // Building a paragraph lays out every grapheme and creates one Pixi Text per glyph.
            // Build the active scene now, then warm only one neighbor on each later frame.
            this.ensureScene(paragraphIndex);
            this.pruneScenes(paragraphIndex);
        } else {
            const next = paragraphIndex + 1;
            const previous = paragraphIndex - 1;
            if (next < this.options.program.paragraphs.length && !this.sceneCache.has(next)) {
                this.ensureScene(next);
            } else if (previous >= 0 && !this.sceneCache.has(previous)) {
                this.ensureScene(previous);
            }
        }
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);
        const finalParagraph = this.options.program.paragraphs.at(-1);
        const creditsFrame = resolveSonnetCreditsFrame(
            time,
            finalParagraph?.endTime ?? Number.POSITIVE_INFINITY,
        );
        const hasCredits = this.creditsContainer.children.length > 0;

        this.sceneCache.forEach((scene, index) => {
            const isActive = index === paragraphIndex;

            // Strict visibility: only the active scene is ever drawn. Zero overlap between scenes.
            scene.container.visible = isActive;
            if (!isActive) {
                const previousShot = scene.shots[scene.activeShotIndex];
                if (previousShot) unloadSonnetDisplayTree(previousShot.container);
                scene.activeShotIndex = -1;
                return;
            }

            const transitionsEnabled = this.options.tuning.enableTransitions && !this.options.staticMode;
            const transitionSeed = hashSonnetSeed(`${this.options.program.seed}:${scene.paragraph.id}:transition-frame`);
            const previousTransition = index > 0
                ? this.options.program.paragraphs[index - 1]?.transitionOut
                : null;
            const enterDuration = previousTransition
                ? Math.max(0.16, Math.min(0.3, previousTransition.endTime - previousTransition.startTime))
                : 0;
            const entering = transitionsEnabled
                && previousTransition !== null
                && time >= scene.paragraph.startTime
                && time <= scene.paragraph.startTime + enterDuration;
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
            const transitionFrame = shotTransitionFrame !== IDLE_SONNET_TRANSITION_FRAME
                ? shotTransitionFrame
                : paragraphTransitionFrame;
            scene.shots.forEach((shot, shotIndex) => {
                const isShotActive = shotIndex === visibleShotIndex;
                shot.container.visible = isShotActive;
                if (!isShotActive) return;
                this.updateShot(shot, time, width, height, 0);
            });
            if (scene.activeShotIndex !== visibleShotIndex) {
                const previousShot = scene.shots[scene.activeShotIndex];
                if (previousShot) unloadSonnetDisplayTree(previousShot.container);
                scene.activeShotIndex = visibleShotIndex;
            }
            // Publish the active shot so the dev overlay's Sonnet tab can inspect it.
            sonnetDebugState.activeShot = scene.shots[visibleShotIndex]?.debugInfo ?? null;
            sonnetDebugState.paragraphIndex = index;

            const isFinalScene = index === this.options.program.paragraphs.length - 1;
            const lyricAlpha = isFinalScene && hasCredits ? creditsFrame.lyricAlpha : 1;
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
                scene.transitionGlitchEffect.update(transitionFrame.glitch, transitionFrame.glitchSeed);
                scene.transitionGlitchEffect.filter.enabled = transitionFrame.glitch > 0.01;
            }

            if (isFinalScene && hasCredits) {
                this.updateOutroBlur(scene, creditsFrame.lyricBlur);
            }
        });

        if (!creditsFrame.active || !hasCredits) this.clearOutroBlur();
        this.creditsContainer.visible = creditsFrame.active && hasCredits && !this.options.tuning.showOnlyText;
        this.creditsContainer.alpha = creditsFrame.posterAlpha;
        this.creditsContainer.position.set(
            width / 2,
            height / 2 + creditsFrame.posterOffsetY * height,
        );
        this.creditsContainer.scale.set(creditsFrame.posterScale);
    }

    renderOnce() {
        if (this.destroyed || !this.app.canvas.isConnected) return;
        this.renderFrame();
        if (this.destroyed) return;
        this.app.renderer.render(this.app.stage);
    }

    /**
     * Applies song, theme and tuning inputs to the live runtime instead of rebuilding it.
     *
     * Rebuilding is what upstream's `swapSong` exists to avoid: `create` destroys the WebGL context,
     * detaches the canvas from the DOM and re-imports Pixi, so the frame goes empty for the whole
     * async build. Here the renderer, the texture pool and the canvas all survive; only the scene
     * cache is dropped, and the next ticker frame re-lays-out just the active paragraph (the neighbour
     * pre-roll follows one per frame, as before).
     */
    setSceneInputs(next: {
        program?: SonnetProgram;
        theme?: Theme;
        tuning?: SonnetTuning;
        lyricsFontScale?: number;
        staticMode?: boolean;
    }) {
        if (this.destroyed) return;
        const previous = this.options;
        const previousResolution = previous.tuning.textureResolution;
        const themeChanged = next.theme !== undefined && next.theme !== previous.theme;
        const tuningChanged = next.tuning !== undefined && next.tuning !== previous.tuning;
        const programChanged = next.program !== undefined && next.program !== previous.program;
        const fontScaleChanged = next.lyricsFontScale !== undefined && next.lyricsFontScale !== previous.lyricsFontScale;
        const staticModeChanged = next.staticMode !== undefined && next.staticMode !== previous.staticMode;
        const structural = themeChanged || tuningChanged || programChanged || fontScaleChanged || staticModeChanged;
        if (!structural) return;

        if (next.program !== undefined) previous.program = next.program;
        if (next.theme !== undefined) previous.theme = next.theme;
        if (next.tuning !== undefined) previous.tuning = next.tuning;
        if (next.lyricsFontScale !== undefined) previous.lyricsFontScale = next.lyricsFontScale;
        if (next.staticMode !== undefined) previous.staticMode = next.staticMode;

        // textureResolution changes the renderer's own resolution, which only resizeToHost applies.
        const resolutionChanged = tuningChanged && previous.tuning.textureResolution !== previousResolution;
        probeCount('sonnet.setSceneInputs');
        if (resolutionChanged && this.lastWidth > 0 && this.lastHeight > 0) {
            // Invalidate the cached size so the next resizeToHost() re-snaps the texture pool.
            this.lastWidth = 0;
            this.lastHeight = 0;
            this.resizeToHost();
        } else {
            // A different song dissolves: hand the drawn picture over to the handover container so
            // it fades out while the new program lays out its first scene. Any other structural
            // change has nothing to cross-fade to, so it drops the outgoing picture outright.
            if (programChanged && !this.options.paused) {
                this.beginHandover();
            } else {
                this.releaseHandover(true);
            }
            // Frames, decor and credits bake theme/tuning colours, so they are rebuilt too.
            this.clearScenes();
            if (this.lastWidth > 0 && this.lastHeight > 0) {
                this.drawCredits(this.lastWidth, this.lastHeight);
                this.drawOverlay(this.lastWidth, this.lastHeight);
            }
        }

        if (themeChanged) void this.reloadIcons();
        if (this.options.paused) this.renderOnce();
    }

    /**
     * Live frame-budget knob. The ticker cap only decides how often Pixi presents a frame; it never
     * touches the WebGL context, the texture pool or the scene cache, so the adaptive performance
     * profile can move it as often as it likes.
     */
    setPerformanceTier(tier: StagePerformanceTier) {
        if (this.destroyed) return;
        this.options.performanceTier = tier;
        this.app.ticker.maxFPS = resolveSonnetTickerMaxFps(tier);
    }

    setPaused(paused: boolean) {
        if (this.destroyed) return;
        this.options.paused = paused;
        if (paused) {
            // The ticker stops with the stage: a half-finished dissolve would freeze on screen.
            this.releaseHandover(true);
            this.app.stop();
            this.renderOnce();
        } else {
            this.app.start();
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        sonnetDebugState.activeShot = null;
        sonnetDebugState.paragraphIndex = -1;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.app.stop();
        this.app.ticker.remove(this.renderFrame);
        this.releaseHandover(true);
        this.clearScenes();
        destroySonnetContainerChildren(this.creditsContainer);
        destroySonnetContainerChildren(this.overlayContainer);
        this.releaseIcons();
        this.app.destroy({ removeView: true }, { children: true, texture: true });
    }
}
