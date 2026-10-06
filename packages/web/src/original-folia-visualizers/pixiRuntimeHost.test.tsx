// @vitest-environment jsdom
import React, { StrictMode, useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualizerPixiHost } from './pixiRuntimeHost';

/**
 * The contract this file exists for: a track change must never rebuild the WebGL context. That is
 * the bug the host was written against - listing the song in the create effect's dependencies meant
 * every skip destroyed the renderer, the texture pool and the scene cache, and left the canvas
 * detached from the DOM for the whole async build.
 */

type Song = { name: string };
type FakeRuntime = { id: number; applied: Song['name'][]; destroyed: number };

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('useVisualizerPixiHost', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeAll(() => {
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    /** Flushes the microtask queue inside `act`, which is where the host's promise chains live. */
    const flush = async () => {
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
    };

    const makeHarness = () => {
        let nextId = 1;
        const runtimes: FakeRuntime[] = [];
        const create = vi.fn(async (host: HTMLDivElement): Promise<FakeRuntime> => {
            // A stand-in for the canvas the real runtime attaches, so "the host is cleared on
            // teardown" is asserted against something that exists.
            host.appendChild(document.createElement('canvas'));
            const runtime: FakeRuntime = { id: nextId++, applied: [], destroyed: 0 };
            runtimes.push(runtime);
            return runtime;
        });
        const swap = vi.fn(async (runtime: FakeRuntime, song: Song) => {
            runtime.applied.push(song.name);
        });
        const destroy = vi.fn((runtime: FakeRuntime) => {
            runtime.destroyed += 1;
        });

        const Harness: React.FC<{
            song: Song;
            rebuildKey?: string;
            createOverride?: (host: HTMLDivElement) => Promise<FakeRuntime>;
        }> = ({
            song,
            rebuildKey = 'stable',
            createOverride,
        }) => {
            const hostRef = useRef<HTMLDivElement>(null);
            const runtimeRef = useVisualizerPixiHost<FakeRuntime, Song>({
                hostRef,
                label: 'Test',
                rebuildKey: [rebuildKey],
                song,
                create: createOverride ?? create,
                swap,
                destroy,
                onFailedChange: undefined,
            });
            return (
                <div ref={hostRef} data-testid="host" data-runtime={String(runtimeRef.current?.id ?? 'none')} />
            );
        };

        return { Harness, create, swap, destroy, runtimes };
    };

    it('creates the runtime once and hands a song change to it in place', async () => {
        const { Harness, create, swap, runtimes } = makeHarness();
        await act(async () => root.render(<Harness song={{ name: 'song-A' }} />));
        await flush();
        expect(create).toHaveBeenCalledTimes(1);
        expect(swap).not.toHaveBeenCalled();

        await act(async () => root.render(<Harness song={{ name: 'song-B' }} />));
        await flush();
        // The whole point: still one runtime, and the new song went to the live one.
        expect(create).toHaveBeenCalledTimes(1);
        expect(swap).toHaveBeenCalledTimes(1);
        expect(runtimes[0]!.applied).toEqual(['song-B']);
        expect(runtimes[0]!.destroyed).toBe(0);
    });

    it('re-creates only when the rebuild key changes, and destroys the runtime it replaces', async () => {
        const { Harness, create, destroy, runtimes } = makeHarness();
        await act(async () => root.render(<Harness song={{ name: 'song-A' }} rebuildKey="one" />));
        await flush();

        await act(async () => root.render(<Harness song={{ name: 'song-A' }} rebuildKey="two" />));
        await flush();

        expect(create).toHaveBeenCalledTimes(2);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(runtimes[0]!.destroyed).toBe(1);
        expect(runtimes[1]!.destroyed).toBe(0);
    });

    it('drains to the newest song instead of queueing one handover per skip', async () => {
        const { Harness, create, swap, runtimes } = makeHarness();
        const gate = deferred<void>();
        swap.mockImplementation(async (runtime: FakeRuntime, song: Song) => {
            runtime.applied.push(song.name);
            if (song.name === 'song-B') await gate.promise;
        });

        await act(async () => root.render(<Harness song={{ name: 'song-A' }} />));
        await flush();

        // Two skips while the first handover is still in flight.
        await act(async () => root.render(<Harness song={{ name: 'song-B' }} />));
        await act(async () => root.render(<Harness song={{ name: 'song-C' }} />));
        await flush();
        expect(swap).toHaveBeenCalledTimes(1);
        expect(swap.mock.calls[0]![1]).toEqual({ name: 'song-B' });

        gate.resolve();
        await flush();

        // Straight to whatever is current: C, with no second B handover in between.
        expect(swap).toHaveBeenCalledTimes(2);
        expect(swap.mock.calls[1]![1]).toEqual({ name: 'song-C' });
        expect(create).toHaveBeenCalledTimes(1);
        expect(runtimes[0]!.applied).toEqual(['song-B', 'song-C']);
    });

    it('destroys the runtime and clears the host on unmount', async () => {
        const { Harness, destroy, runtimes } = makeHarness();
        await act(async () => root.render(<Harness song={{ name: 'song-A' }} />));
        await flush();
        const host = container.querySelector('[data-testid="host"]')!;
        expect(host.querySelector('canvas')).not.toBeNull();

        act(() => root.unmount());
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(runtimes[0]!.destroyed).toBe(1);
        expect(host.childNodes.length).toBe(0);
        // The second unmount in afterEach must not double-destroy.
        root = createRoot(container);
    });

    it('destroys a runtime that resolves after the host was torn down', async () => {
        const { Harness, destroy, runtimes } = makeHarness();
        const gate = deferred<FakeRuntime>();
        const create = vi.fn(() => gate.promise);

        await act(async () => root.render(<Harness song={{ name: 'song-A' }} createOverride={create} />));
        act(() => root.unmount());
        expect(destroy).not.toHaveBeenCalled();

        await act(async () => {
            gate.resolve({ id: 99, applied: [], destroyed: 0 });
            await Promise.resolve();
            await Promise.resolve();
        });
        // Late arrival: destroyed rather than leaked into a host that no longer exists.
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(runtimes).toHaveLength(0);
        root = createRoot(container);
    });

    it('reports a failed create instead of throwing into the render', async () => {
        const onFailed = vi.fn();
        const create = vi.fn(async () => {
            throw new Error('no GPU');
        });
        const Failing: React.FC = () => {
            const hostRef = useRef<HTMLDivElement>(null);
            useVisualizerPixiHost<FakeRuntime, Song>({
                hostRef,
                label: 'Test',
                rebuildKey: [],
                song: { name: 'song-A' },
                create,
                swap: vi.fn(),
                destroy: vi.fn(),
                onFailedChange: onFailed,
            });
            return <div ref={hostRef} />;
        };
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        await act(async () => root.render(<Failing />));
        await flush();
        expect(onFailed).toHaveBeenCalledWith(false);
        expect(onFailed).toHaveBeenCalledWith(true);
        consoleError.mockRestore();
    });

    it('keeps one runtime per mount under StrictMode, so later song changes still swap', async () => {
        const { Harness, create, swap } = makeHarness();
        await act(async () =>
            root.render(
                <StrictMode>
                    <Harness song={{ name: 'song-A' }} />
                </StrictMode>,
            ),
        );
        await flush();
        // React 19 double-invokes the mount effect in development: one create per mount, the first
        // one torn down again. That is the framework, not a song-scoped rebuild.
        const createsAfterMount = create.mock.calls.length;

        await act(async () =>
            root.render(
                <StrictMode>
                    <Harness song={{ name: 'song-B' }} />
                </StrictMode>,
            ),
        );
        await flush();
        expect(create.mock.calls.length).toBe(createsAfterMount);
        expect(swap).toHaveBeenCalledTimes(1);
        expect(swap.mock.calls[0]![1]).toEqual({ name: 'song-B' });
    });
});
