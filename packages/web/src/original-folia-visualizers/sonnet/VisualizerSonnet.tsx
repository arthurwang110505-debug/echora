import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SONNET_TUNING } from '../../types';
import type { Line } from '../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import { getLineRenderEndTime } from '../../utils/lyrics/renderHints';
import type { VisualizerSharedProps } from '../definition';
import { useVisualizerPixiHost } from '../pixiRuntimeHost';
import { useVisualizerRuntime } from '../runtime';
import { resolveSubtitleFontSizes } from '../subtitleFontSizes';
import VisualizerShell from '../VisualizerShell';
import VisualizerSubtitleOverlay from '../VisualizerSubtitleOverlay';
import type { SonnetPixiRuntime, SonnetSongMetadata } from './createSonnetPixiRuntime';
import type { SonnetProgram } from './types';
import { compileSonnetProgram } from './sonnetProgram';
import { resolveCompactSonnetTuning, useLatchedStageTier, useStagePerformanceProfile } from '../../utils/stagePerformance';

// src/components/visualizer/sonnet/VisualizerSonnet.tsx
// Mounts the lazily loaded Pixi director while React retains shell and subtitle responsibilities.
const EMPTY_SONNET_LINES: Line[] = [];

/**
 * Everything the renderer needs from the song on screen, as one object whose identity changes when
 * any of it does. The tuning is not here: it moves on every pointer move of a slider and belongs to
 * the live-update path, not to a handover.
 */
type SonnetSongContext = {
    program: SonnetProgram;
    theme: VisualizerSharedProps['theme'];
    lyricsFontScale: number;
    staticMode: boolean;
};

const VisualizerSonnet: React.FC<VisualizerSharedProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        audioPower,
        audioBands,
        showText = true,
        lyricsFontScale = 1,
        staticMode = false,
        paused = false,
        seed = 'sonnet',
        songTitle,
        songArtist,
        songAlbum,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
        subtitleTheme,
        subtitleFontScale,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        sonnetTuning = DEFAULT_SONNET_TUNING,
    } = props;
    const { t } = useTranslation();
    const performanceProfile = useStagePerformanceProfile(paused);
    const performanceTier = performanceProfile.tier;
    // textureResolution decides the renderer's own resolution, so it follows the lowest tier this
    // mount has settled on - a moving renderer height costs a resize plus a scene rebuild, and the
    // adaptive observer must never be able to make the composition oscillate.
    const structuralTier = useLatchedStageTier(performanceTier);
    const effectiveSonnetTuning = useMemo(
        () => resolveCompactSonnetTuning(sonnetTuning, structuralTier),
        [structuralTier, sonnetTuning],
    );
    const hostRef = useRef<HTMLDivElement>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const latestSongMetadataRef = useRef<SonnetSongMetadata>({
        title: songTitle,
        artist: songArtist,
        album: songAlbum,
    });
    latestSongMetadataRef.current = {
        title: songTitle,
        artist: songArtist,
        album: songAlbum,
    };
    const [runtimeFailed, setRuntimeFailed] = useState(false);
    const performanceTierRef = useRef(performanceTier);
    performanceTierRef.current = performanceTier;
    const [isInstrumental, setIsInstrumental] = useState(false);
    const lyricsSig = lines.length === 0 ? '' : `${lines.length}|${lines[0]?.fullText ?? ''}`;
    const seedRef = useRef(seed);

    useEffect(() => {
        if (lyricsSig !== '') {
            setIsInstrumental(false);
            seedRef.current = seed;
            return undefined;
        }
        if (seed !== seedRef.current) {
            setIsInstrumental(false);
            seedRef.current = seed;
        }
        if (paused) return undefined;

        let raf = 0;
        let sawReset = false;
        const startWall = performance.now();
        const watch = () => {
            const t = currentTime.get();
            const capped = performance.now() - startWall >= 3000;
            if (!sawReset && t < 1) sawReset = true;
            if ((sawReset && t >= 2) || capped) {
                setIsInstrumental(true);
                return;
            }
            raf = requestAnimationFrame(watch);
        };
        raf = requestAnimationFrame(watch);
        return () => cancelAnimationFrame(raf);
    }, [seed, lyricsSig, currentTime, paused]);

    const virtualLines = useMemo(() => {
        if (!isInstrumental) return EMPTY_SONNET_LINES;
        const generated: Line[] = [];
        for (let i = 0; i < 60; i++) {
            generated.push({
                id: `virtual-staff-${i}`,
                startTime: i * 8,
                endTime: i * 8 + 6,
                fullText: '♪',
                words: [],
                isChorus: false,
            });
        }
        return generated;
    }, [isInstrumental]);

    const programLines = showText ? (lines.length > 0 ? lines : virtualLines) : EMPTY_SONNET_LINES;
    const program = useMemo(
        () => compileSonnetProgram(programLines, seed),
        [programLines, seed],
    );
    const { activeLine, recentCompletedLine, nextLines } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    // Song-scoped inputs as one object, so a track change is a single identity change. The
    // tuning is deliberately *not* in here: it moves on every pointer move of a slider, and it is
    // pushed into the live runtime by the effect below instead of going through a handover.
    const songContext = useMemo<SonnetSongContext>(
        () => ({ program, theme, lyricsFontScale, staticMode }),
        [program, theme, lyricsFontScale, staticMode],
    );
    const songContextRef = useRef(songContext);
    songContextRef.current = songContext;
    const tuningRef = useRef(effectiveSonnetTuning);
    tuningRef.current = effectiveSonnetTuning;

    // Mount-once lifecycle: the runtime is built once and every song-scoped change (a new track, a
    // theme switch, the font scale) is applied to the live renderer. Listing the song in the create
    // effect's dependencies is what used to destroy and re-create the whole WebGL context - a blank
    // frame for the length of the async build - on every track change.
    const runtimeRef = useVisualizerPixiHost<SonnetPixiRuntime, SonnetSongContext>({
        hostRef,
        label: 'Sonnet',
        // Only inputs that genuinely require a new WebGL context and texture pool.
        rebuildKey: [audioBands, audioPower, currentTime],
        song: songContext,
        create: async (host, song, signal) => {
            const { SonnetPixiRuntime: Runtime } = await import('./createSonnetPixiRuntime');
            const metadata = latestSongMetadataRef.current;
            return Runtime.create({
                host,
                program: song.program,
                theme: song.theme,
                tuning: tuningRef.current,
                currentTime,
                audioPower,
                audioBands,
                lyricsFontScale: song.lyricsFontScale,
                staticMode: song.staticMode,
                paused: pausedRef.current,
                // Keep the complete Sonnet composition on touch viewports;
                // compact mode only reduces renderer work and effect quality.
                performanceTier: performanceTierRef.current,
                songTitle: metadata.title,
                songArtist: metadata.artist,
                songAlbum: metadata.album,
                signal,
            });
        },
        swap: (runtime, song) => {
            // Partial patch: the runtime keeps whatever this call does not mention, and ignores a
            // call that changes nothing. The tuning rides along so a combined change stays one
            // update rather than being applied twice in the same commit.
            runtime.setSceneInputs({ ...song, tuning: tuningRef.current });
            runtime.setSongMetadata(latestSongMetadataRef.current);
        },
        destroy: runtime => runtime.destroy(),
        onFailedChange: setRuntimeFailed,
    });

    // Hot updates: the runtime keeps rendering on the same canvas while the tuning moves underneath
    // it. The song-scoped inputs arrive through the host's `swap` above.
    useEffect(() => {
        runtimeRef.current?.setSceneInputs({ ...songContextRef.current, tuning: effectiveSonnetTuning });
    }, [effectiveSonnetTuning]);

    useEffect(() => {
        runtimeRef.current?.setPerformanceTier(performanceTier);
    }, [performanceTier]);

    useEffect(() => {
        runtimeRef.current?.setSongMetadata(latestSongMetadataRef.current);
    }, [songAlbum, songArtist, songTitle]);

    useEffect(() => {
        runtimeRef.current?.setPaused(paused);
    }, [paused]);

    useEffect(() => currentTime.on('change', () => {
        if (paused) runtimeRef.current?.renderOnce();
    }), [currentTime, paused]);

    const { translationFontSize, upcomingFontSize } = resolveSubtitleFontSizes(lyricsFontScale);
    const fallbackFontFamily = resolveThemeFontStack(theme);
    const fallbackFontWeight = resolveThemeFontWeight(theme, 600);
    const finalLine = lines.at(-1);
    const creditsRecentCompletedLine = recentCompletedLine === finalLine
        ? null
        : recentCompletedLine;

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
            performanceTier={structuralTier}
        >
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                <div ref={hostRef} className="absolute inset-0 z-10" aria-hidden="true" />
                {(runtimeFailed || program.paragraphs.length === 0) && (
                    <div
                        className="absolute inset-0 flex items-center justify-center px-10 text-center transition-opacity duration-300"
                        style={{
                            color: theme.primaryColor,
                            fontFamily: fallbackFontFamily,
                            fontWeight: fallbackFontWeight,
                            fontSize: `clamp(2rem, ${5.4 * lyricsFontScale}vw, 5.6rem)`,
                        }}
                    >
                        {showText && !isInstrumental ? (activeLine?.fullText || t('ui.waitingForMusic')) : null}
                    </div>
                )}
            </div>

            <VisualizerSubtitleOverlay
                showText={showText}
                activeLine={activeLine}
                recentCompletedLine={creditsRecentCompletedLine}
                nextLines={nextLines}
                theme={theme}
                subtitleTheme={subtitleTheme}
                translationFontSize={translationFontSize}
                upcomingFontSize={upcomingFontSize}
                subtitleFontScale={subtitleFontScale}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                subtitleOverlayBackground={subtitleOverlayBackground}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                showSubtitleTranslation={showSubtitleTranslation}
                subtitleContentMode={subtitleContentMode}
            />
        </VisualizerShell>
    );
};

export default VisualizerSonnet;
