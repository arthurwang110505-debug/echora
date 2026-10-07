// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/VisualizerLumiere.tsx
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LUMIERE_TUNING } from '../../types';
import type { Line } from '../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import { getLineRenderEndTime } from '../../utils/lyrics/renderHints';
import type { VisualizerSharedProps } from '../definition';
import { useVisualizerPixiHost } from '../pixiRuntimeHost';
import { useVisualizerRuntime } from '../runtime';
import { useVisualizerSongCommit } from '../songHandover';
import { resolveSubtitleFontSizes } from '../subtitleFontSizes';
import VisualizerShell from '../VisualizerShell';
import VisualizerSubtitleOverlay from '../VisualizerSubtitleOverlay';
import type { LumierePixiRuntime, LumiereSongContext, LumiereSongMetadata } from './createLumierePixiRuntime';
import { compileLumiereProgram } from './lumiereProgram';
import { resolveLumiereCompileOptions } from './lumiereRuntimeTuning';

// src/components/visualizer/lumiere/VisualizerLumiere.tsx
// 繪光的 React 外殼：掛共享 shell / 字幕層，把按需加載的 Pixi 運行時建一次，換歌、tuning、暫停都就地推給它。
// 每幀的時間只在運行時的 draw loop 裡讀 currentTime，不進 React state。
const EMPTY_LUMIERE_LINES: Line[] = [];

const VisualizerLumiere: React.FC<VisualizerSharedProps> = (props) => {
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
        seed = 'lumiere',
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
        subtitleUpcomingLyricsBlur,
        lumiereTuning = DEFAULT_LUMIERE_TUNING,
    } = props;
    const { t } = useTranslation();
    const hostRef = useRef<HTMLDivElement>(null);
    const [runtimeFailed, setRuntimeFailed] = useState(false);

    // 運行時創建期間這些輸入可能已經變了；create 完成後按最新值補一次。
    const latestRef = useRef({ tuning: lumiereTuning, paused, showText, staticMode, audioPower, audioBands });
    latestRef.current = { tuning: lumiereTuning, paused, showText, staticMode, audioPower, audioBands };
    const metadataRef = useRef<LumiereSongMetadata>({ title: songTitle, artist: songArtist, album: songAlbum });
    metadataRef.current = { title: songTitle, artist: songArtist, album: songAlbum };

    // 真正在畫的歌：切歌時滯後於 props，免得對著還沒到的歌詞重建場景（songHandover.ts）。
    const committedSong = useVisualizerSongCommit({
        seed,
        lines,
        currentTime,
        readyGraceMs: 3000,
    });
    const committedSeed = committedSong.seed;
    const committedLines = committedSong.isInstrumental ? EMPTY_LUMIERE_LINES : committedSong.lines;

    // 純音樂 / 歌詞還沒到：編譯成只有間奏鏡頭的程序（folia 不給 visualizer 傳歌曲時長，用編譯器的缺省時長），
    // 光照照常，不造 ♪ 虛擬行。showText 關掉時仍按真實歌詞編譯，鏡頭節奏跟著歌走，只是不畫字。
    // 軌跡過渡改變編譯結果：切換時重新編譯，新程序走同曲替換（swapSong → commitSong 清場景緩存），不重建 WebGL。
    const seamlessTransitions = lumiereTuning.seamlessTransitions;
    const program = useMemo(
        () => compileLumiereProgram(committedLines, committedSeed, {}, resolveLumiereCompileOptions({ seamlessTransitions })),
        [committedLines, committedSeed, seamlessTransitions],
    );
    const { activeLine, recentCompletedLine, nextLines } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    const songContext = useMemo<LumiereSongContext>(
        () => ({ seed: committedSeed, program, theme }),
        [committedSeed, program, theme],
    );

    const runtimeRef = useVisualizerPixiHost<LumierePixiRuntime, LumiereSongContext>({
        hostRef,
        label: 'Lumiere',
        // 只有真正需要新 WebGL 上下文的輸入；歌、tuning、暫停、靜態模式都就地推給運行時。
        rebuildKey: [currentTime],
        song: songContext,
        create: async (host, song, signal) => {
            const { LumierePixiRuntime } = await import('./createLumierePixiRuntime');
            const latest = latestRef.current;
            const runtime = await LumierePixiRuntime.create({
                host,
                song,
                tuning: latest.tuning,
                currentTime,
                audioPower: latest.audioPower,
                audioBands: latest.audioBands,
                staticMode: latest.staticMode,
                showText: latest.showText,
                paused: latest.paused,
                metadata: metadataRef.current,
                signal,
            });
            const current = latestRef.current;
            runtime.setSongMetadata(metadataRef.current);
            runtime.setTuning(current.tuning);
            runtime.setShowText(current.showText);
            runtime.setStaticMode(current.staticMode);
            runtime.setAudioSources(current.audioPower, current.audioBands);
            runtime.setPaused(current.paused);
            return runtime;
        },
        swap: (runtime, song, signal) => runtime.swapSong(song, signal),
        destroy: runtime => runtime.destroy(),
        onFailedChange: setRuntimeFailed,
    });

    useEffect(() => {
        runtimeRef.current?.setTuning(lumiereTuning);
    }, [lumiereTuning, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setShowText(showText);
    }, [showText, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setStaticMode(staticMode);
    }, [staticMode, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setAudioSources(audioPower, audioBands);
    }, [audioPower, audioBands, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setSongMetadata(metadataRef.current);
    }, [songAlbum, songArtist, songTitle, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setPaused(paused);
    }, [paused, runtimeRef]);

    // 暫停時 ticker 停著，拖動進度要手動補一幀。
    useEffect(() => currentTime.on('change', () => {
        if (paused) runtimeRef.current?.renderOnce();
    }), [currentTime, paused, runtimeRef]);

    const fallbackFontFamily = resolveThemeFontStack(theme);
    const fallbackFontWeight = resolveThemeFontWeight(theme, 500);
    const subtitleFontSizes = resolveSubtitleFontSizes(lyricsFontScale);
    const finalLine = lines.at(-1);
    // 片尾卡出來以後不再在字幕裡重複最後一句。
    const creditsRecentCompletedLine = recentCompletedLine === finalLine ? null : recentCompletedLine;

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                <div ref={hostRef} className="absolute inset-0 z-10" aria-hidden="true" />
                {runtimeFailed && (
                    <div
                        className="absolute inset-0 flex items-center justify-center px-10 text-center transition-opacity duration-300"
                        style={{
                            color: theme.primaryColor,
                            fontFamily: fallbackFontFamily,
                            fontWeight: fallbackFontWeight,
                            fontSize: `clamp(2rem, ${5.4 * lyricsFontScale}vw, 5.6rem)`,
                        }}
                    >
                        {showText && !committedSong.isInstrumental ? (activeLine?.fullText || t('ui.waitingForMusic')) : null}
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
                translationFontSize={subtitleFontSizes.translationFontSize}
                upcomingFontSize={subtitleFontSizes.upcomingFontSize}
                subtitleFontScale={subtitleFontScale}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                subtitleOverlayBackground={subtitleOverlayBackground}
                subtitleUpcomingLyricsBlur={subtitleUpcomingLyricsBlur}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                showSubtitleTranslation={showSubtitleTranslation}
                subtitleContentMode={subtitleContentMode}
            />
        </VisualizerShell>
    );
};

export default VisualizerLumiere;
