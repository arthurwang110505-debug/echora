import { lazyWithRetry } from '../utils/recovery';
import { Suspense, useCallback, useMemo } from 'react';
import { buildObsStageOverlayUrl, parseObsStageOverlayParams, resolveObsStageLineIndex, resolveObsStageTime } from '../obs/protocol';
import { useObsStageSource } from '../obs/useObsStageSource';
import { useObsStageStore } from '../store/obsStageStore';

// src/pages/ObsStage.tsx
//
// The overlay: a bare, chrome-free page an OBS browser source (or a captured window) can point at.
// It renders the same stage the player does, driven by the stream instead of by local playback.
//
// Nothing here polls the player's store, reads its storage or shares its React tree - the overlay may
// be a different browser entirely.

const OriginalFoliaVisualizerStage = lazyWithRetry(
    () => import('../components/OriginalFoliaVisualizerStage'),
    'obs-stage-visualizer',
);

const ObsStage: React.FC = () => {
    const params = useMemo(() => parseObsStageOverlayParams(window.location.search), []);
    const { status, config, clock, error } = useObsStageSource(params);
    // The relay address stored in Settings is what a user copies; showing it here is how they can
    // tell a typo in the URL from a relay that is not running.
    const storedRelay = useObsStageStore(state => state.relay);
    const storedToken = useObsStageStore(state => state.token);

    // A 60 Hz stage reading a 5 Hz clock: the loop asks for the time each frame and only the stage
    // re-renders, so this callback is stable.
    const timeProvider = useCallback(() => resolveObsStageTime(clock, Date.now()), [clock]);

    // The active line is a discrete change, so it can refresh at a human rate instead of per frame.
    const lineIndex = useMemo(
        () => resolveObsStageLineIndex(config?.lyrics ?? [], resolveObsStageTime(clock)),
        // Deliberately not per frame: re-rendering the stage on every line is exactly the churn the
        // timeProvider exists to avoid. `clock` changes ~5x/second, which is fast enough.
        [config, clock],
    );

    if (!config) {
        if (params.quiet) {
            return <div className="h-screen w-screen bg-transparent" data-obs-overlay="waiting" />;
        }
        const expectedRelay = storedRelay || params.relay;
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#07090e] p-8 text-center">
                <p className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">
                    Echora · Stage overlay
                </p>
                <p className="text-sm font-semibold text-white">
                    {status === 'connecting' ? 'Waiting for the player…' : 'No player connected'}
                </p>
                <p className="max-w-md text-xs leading-5 text-slate-400">
                    {error
                        ? `Transport: ${error}.`
                        : 'Open Echora, play a song, and turn on publishing in Settings → Stage.'}
                </p>
                <dl className="mt-2 space-y-1 font-mono text-[11px] text-slate-500">
                    <div>transport: {params.transport}</div>
                    {params.transport === 'relay' && <div>relay: {expectedRelay}</div>}
                    {params.transport === 'relay' && !storedToken && !params.token && (
                        <div className="text-amber-300">no token in this URL or in Settings</div>
                    )}
                </dl>
                <p className="mt-1 max-w-md font-mono text-[10px] leading-4 text-slate-600">
                    {buildObsStageOverlayUrl(window.location.origin, {
                        relay: expectedRelay,
                        token: storedToken || params.token,
                        transport: params.transport,
                        quiet: true,
                    })}
                </p>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-transparent">
            <Suspense fallback={<div className="h-screen w-screen bg-transparent" />}>
                <OriginalFoliaVisualizerStage
                    lines={config.lyrics}
                    activeLineIndex={lineIndex}
                    displayedTime={resolveObsStageTime(clock)}
                    timeProvider={timeProvider}
                    isPlaying={clock?.playerState === 'playing'}
                    theme={config.theme}
                    visualizerMode={config.visualizerMode}
                    coverUrl={config.song?.coverUrl ?? undefined}
                    songTitle={config.song?.title}
                    songArtist={config.song?.artist}
                    songAlbum={config.song?.album}
                    onSeekLine={noopSeek}
                    backgroundMode={config.backgroundMode}
                    visualizerTunings={config.visualizerTunings}
                    isPlayerChromeHidden
                    settingsOpen={false}
                />
            </Suspense>
        </div>
    );
};

// The overlay is read-only: seeking from it would need a channel back to the player, which the
// Stage API does not have (upstream's overlay is read-only too).
const noopSeek = () => undefined;

export default ObsStage;
