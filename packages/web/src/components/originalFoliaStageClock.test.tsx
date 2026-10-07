// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MotionValue } from 'framer-motion';

// src/components/originalFoliaStageClock.test.tsx
//
// What a stage renderer actually sees. `createTemperaPixiRuntime.renderFrame` and
// `createLumierePixiRuntime.renderFrame` both begin with `const time = this.options.currentTime.get()`
// and pick the paragraph, shot, camera pose and transition phase from it, so the observable
// contract is: read that MotionValue once per frame and the timeline must have MOVED.
//
// The player store is written by the media element's `timeupdate` event (~4x/second for local
// audio), so a stage that forwarded the prop published the same position for ~15 frames in a row
// and then jumped - which is what made the timeline-driven modes read as stuck while the
// audio-band-driven ones kept moving.
//
// The renderer is stubbed rather than mounted: this measures the clock the stage publishes, and
// the real one needs a WebGL context jsdom does not have.

const { captured } = vi.hoisted(() => ({
    captured: {
        currentTime: null as MotionValue<number> | null,
        seed: undefined as string | number | undefined,
        renders: 0,
    },
}));

vi.mock('./OriginalVisualizerRendererProxy.js', () => ({
    default: (props: { currentTime: MotionValue<number>; seed?: string | number }) => {
        captured.currentTime = props.currentTime;
        captured.seed = props.seed;
        captured.renders += 1;
        return <div data-stage-renderer="stub" />;
    },
}));

const { default: OriginalFoliaVisualizerStage } = await import('./OriginalFoliaVisualizerStage');

const THEME = {
    name: 'spec',
    backgroundColor: '#07090e',
    primaryColor: '#62f5c4',
    accentColor: '#62f5c4',
    secondaryColor: '#6366f1',
    fontStyle: 'sans' as const,
};

const FRAME_MS = 1000 / 60;
/** Chrome fires `timeupdate` about four times a second; the spec allows 15-250 ms. */
const HOST_UPDATE_MS = 250;

describe('the clock the stage publishes', () => {
    let container: HTMLDivElement;
    let root: Root;
    let virtualNow = 0;
    let rafQueue: { id: number; callback: FrameRequestCallback }[] = [];
    let nextRafId = 1;
    let nativeRaf: typeof window.requestAnimationFrame;
    let nativeCancel: typeof window.cancelAnimationFrame;
    let nowSpy: { mockRestore: () => void } | undefined;

    beforeAll(() => {
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    beforeEach(() => {
        captured.currentTime = null;
        captured.seed = undefined;
        captured.renders = 0;
        virtualNow = 0;
        rafQueue = [];
        nextRafId = 1;

        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        nativeRaf = window.requestAnimationFrame;
        nativeCancel = window.cancelAnimationFrame;
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            const id = nextRafId;
            nextRafId += 1;
            rafQueue.push({ id, callback });
            return id;
        };
        window.cancelAnimationFrame = (id: number) => {
            rafQueue = rafQueue.filter(entry => entry.id !== id);
        };
        nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => virtualNow) as unknown as { mockRestore: () => void };
    });

    afterEach(() => {
        nowSpy?.mockRestore();
        window.requestAnimationFrame = nativeRaf;
        window.cancelAnimationFrame = nativeCancel;
        act(() => root.unmount());
        container.remove();
    });

    /** One animation frame: advance the clock, flush every callback scheduled for it. */
    const stepFrame = () => {
        virtualNow += FRAME_MS;
        const due = rafQueue;
        rafQueue = [];
        due.forEach(entry => entry.callback(virtualNow));
    };

    /** Runs `seconds` of frames, handing the stage a new store position every HOST_UPDATE_MS. */
    const play = async ({
        seconds,
        startTimeSec = 10,
        isPlaying = true,
        durationSec,
    }: {
        seconds: number;
        startTimeSec?: number;
        isPlaying?: boolean;
        durationSec?: number;
    }) => {
        const totalFrames = Math.round((seconds * 1000) / FRAME_MS);
        let nextHostUpdateMs = 0;
        let reported = startTimeSec;
        const published: number[] = [];

        for (let frame = 0; frame <= totalFrames; frame += 1) {
            const elapsedMs = frame * FRAME_MS;
            // The store only learns a new position when the media element reports one - and only
            // while it is actually playing. Between those the player still re-renders (it is
            // subscribed to the whole store) with the same stale value.
            if (isPlaying && elapsedMs >= nextHostUpdateMs) {
                reported = startTimeSec + elapsedMs / 1000;
                nextHostUpdateMs += HOST_UPDATE_MS;
            }
            await act(async () => {
                root.render(
                    <OriginalFoliaVisualizerStage
                        lines={[]}
                        activeLineIndex={0}
                        displayedTime={reported}
                        isPlaying={isPlaying}
                        durationSec={durationSec}
                        songId="song-1"
                        theme={THEME}
                        visualizerMode="tempera"
                        onSeekLine={() => undefined}
                    />,
                );
            });
            stepFrame();
            // Exactly what a Pixi runtime's ticker does each frame.
            published.push(captured.currentTime!.get());
        }
        return published;
    };

    it('advances every frame instead of holding each store position for ~15 frames', async () => {
        const published = await play({ seconds: 1 });

        // 61 frames in one second. Forwarding the prop would repeat each of the four store
        // positions ~15 times; the extrapolated clock has to be distinct nearly every frame.
        expect(published.length).toBe(61);
        const distinct = new Set(published.map(value => value.toFixed(4))).size;
        expect(distinct, `only ${distinct} distinct positions across ${published.length} frames`).toBeGreaterThan(55);
    });

    it('stays monotonic and tracks the real position', async () => {
        const published = await play({ seconds: 2, startTimeSec: 10 });

        for (let index = 1; index < published.length; index += 1) {
            expect(published[index], `frame ${index} went backwards`).toBeGreaterThanOrEqual(published[index - 1]!);
        }
        // Two seconds from 10 s, sampled against a 4 Hz anchor.
        expect(published[published.length - 1]!).toBeCloseTo(12, 1);
    });

    it('holds the position while paused and publishes a seek', async () => {
        const held = await play({ seconds: 1, startTimeSec: 42, isPlaying: false });
        expect(new Set(held.map(value => value.toFixed(4))).size).toBe(1);
        expect(held[0]).toBe(42);

        // Dragging the progress bar while paused: the rAF loop is not running, so the paused sync
        // effect is the only thing that can move the held picture.
        await act(async () => {
            root.render(
                <OriginalFoliaVisualizerStage
                    lines={[]}
                    activeLineIndex={0}
                    displayedTime={57.5}
                    isPlaying={false}
                    songId="song-1"
                    theme={THEME}
                    visualizerMode="tempera"
                    onSeekLine={() => undefined}
                />,
            );
        });
        expect(captured.currentTime!.get()).toBe(57.5);
    });

    it('does not run past the end of the track', async () => {
        const published = await play({ seconds: 1, startTimeSec: 199.5, durationSec: 200 });
        expect(published[published.length - 1]!).toBe(200);
        expect(published.every(value => value <= 200)).toBe(true);
    });

    it('hands the visualizers a track identity, so a change is a change', async () => {
        await play({ seconds: 0.1 });
        // Without `seed` every song looks like the same one to songHandover's commit gate, and the
        // Pixi runtimes take their straight-through swap branch (no handover) on a track change.
        expect(captured.seed).toBe('song-1');
    });
});
