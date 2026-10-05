import { useEffect, useMemo, useRef } from 'react';
import type { Line, ThemeConfig } from '@echora/core';
import { useObsStageStore } from '../store/obsStageStore';
import { createObsStageBroadcaster } from './broadcast';
import {
    OBS_STAGE_CLOCK_INTERVAL_MS,
    OBS_STAGE_PROTOCOL_VERSION,
    ObsStageConfigPublisher,
    type ObsStageClock,
    type ObsStageConfig,
    type ObsStagePublishMessage,
    type ObsStageSong,
} from './protocol';

// src/obs/useObsStagePublisher.ts
//
// The player's send side: config when something an overlay can see changes, clock on a timer.
//
// The split matters. Config carries the lyrics, theme and tuning, so it is large and rarely changes;
// the clock is a 200 ms anchor the overlay extrapolates to 60 fps. Publishing positions instead of
// anchors would either stutter (too slow) or flood the relay (too fast).

export interface ObsStagePublisherInput {
    visualizerMode: string;
    backgroundMode: string;
    visualizerTunings?: Record<string, unknown>;
    theme: ThemeConfig;
    lyrics: Line[];
    song: ObsStageSong | null;
    /** Stage time in seconds, lyrics offset already applied. */
    currentTime: number;
    playing: boolean;
    duration: number;
    showText?: boolean;
}

const buildClock = (input: ObsStagePublisherInput, nowMs: number): ObsStageClock => ({
    currentTime: Math.max(0, input.currentTime),
    sentAtMs: nowMs,
    playerState: input.playing ? 'playing' : 'paused',
    duration: input.duration,
    playbackRate: 1,
    // `currentTime` above is stage time, so the overlay must not subtract the offset again.
    lyricOffsetMs: 0,
});

export const useObsStagePublisher = (input: ObsStagePublisherInput): { publishing: boolean } => {
    const enabled = useObsStageStore(state => state.enabled);
    const transport = useObsStageStore(state => state.transport);
    const relay = useObsStageStore(state => state.relay);
    const token = useObsStageStore(state => state.token);
    const isPublishable = useObsStageStore(state => state.isPublishable);

    const tracker = useMemo(() => new ObsStageConfigPublisher(), []);
    const inputRef = useRef(input);
    inputRef.current = input;
    // Reading the store inside the loop keeps the effect independent of every settings keystroke.
    const settingsRef = useRef({ relay, token, transport });
    settingsRef.current = { relay, token, transport };

    const publishing = enabled && isPublishable();

    useEffect(() => {
        if (!publishing) {
            tracker.reset();
            return undefined;
        }

        const broadcaster = transport === 'broadcast' ? createObsStageBroadcaster() : null;
        const abort = new AbortController();
        let disposed = false;

        const post = (message: ObsStagePublishMessage) => {
            if (broadcaster) {
                broadcaster.post(message);
                return;
            }
            const { relay: host, token: secret } = settingsRef.current;
            void fetch(`http://${host.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/stage/publish`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
                },
                body: JSON.stringify(message),
                signal: abort.signal,
                // The relay is a different origin (loopback) from the deployed app.
                mode: 'cors',
                keepalive: true,
            }).catch(() => {
                // A relay that is not running must not surface as a playback error; the settings card
                // says whether publishing is configured, and the overlay reports its own status.
            });
        };

        const buildConfig = (): ObsStageConfig => {
            const current = inputRef.current;
            return {
                version: OBS_STAGE_PROTOCOL_VERSION,
                updatedAt: Date.now(),
                visualizerMode: current.visualizerMode,
                backgroundMode: current.backgroundMode,
                visualizerTunings: current.visualizerTunings ?? {},
                theme: current.theme,
                song: current.song,
                lyrics: current.lyrics,
                showText: current.showText ?? true,
            };
        };

        // Config is large and rarely changes: check on a slow timer rather than every frame, and let
        // the tracker decide whether anything actually differs.
        const publishConfig = () => {
            if (disposed) return;
            const config = tracker.prepare(true, buildConfig());
            if (config) post({ kind: 'config', config });
        };
        publishConfig();
        const configTimer = window.setInterval(publishConfig, 2000);

        let lastClockAt = 0;
        let frame = 0;
        const tick = () => {
            if (disposed) return;
            const now = Date.now();
            if (now - lastClockAt >= OBS_STAGE_CLOCK_INTERVAL_MS) {
                lastClockAt = now;
                post({ kind: 'clock', clock: buildClock(inputRef.current, now) });
            }
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);

        return () => {
            disposed = true;
            abort.abort();
            window.clearInterval(configTimer);
            if (frame !== 0) window.cancelAnimationFrame(frame);
            broadcaster?.close();
        };
    }, [publishing, transport, tracker]);

    return { publishing };
};
