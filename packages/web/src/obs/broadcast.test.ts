// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createObsStageBroadcaster, isObsStageBroadcastAvailable, OBS_STAGE_BROADCAST_CHANNEL } from './broadcast';
import { OBS_STAGE_PROTOCOL_VERSION, type ObsStagePublishMessage } from './protocol';

// src/obs/broadcast.test.ts
//
// The zero-setup transport, as a round trip: a publisher handle posts, a separate channel on the
// same name receives. This is the path "open the overlay in a second window and capture it" uses,
// so it should not be shipped on the strength of reading the code.

const nextMessage = (channel: BroadcastChannel, timeoutMs = 2000): Promise<unknown> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), timeoutMs);
    channel.onmessage = event => {
        clearTimeout(timer);
        resolve(event.data);
    };
});

describe('obs stage broadcast transport', () => {
    it('is available in this runtime', () => {
        expect(isObsStageBroadcastAvailable()).toBe(true);
    });

    it('reports unavailable instead of throwing when there is no channel', () => {
        expect(isObsStageBroadcastAvailable({})).toBe(false);
        expect(isObsStageBroadcastAvailable(null)).toBe(false);
    });

    it('delivers both message kinds to a listener on the same channel name', async () => {
        const broadcaster = createObsStageBroadcaster();
        expect(broadcaster).not.toBeNull();
        const listener = new BroadcastChannel(OBS_STAGE_BROADCAST_CHANNEL);

        const config: ObsStagePublishMessage = {
            kind: 'config',
            config: {
                version: OBS_STAGE_PROTOCOL_VERSION,
                updatedAt: 1,
                visualizerMode: 'sonnet',
                backgroundMode: 'latent',
                theme: { name: 't', backgroundColor: '#000', primaryColor: '#111', accentColor: '#222', secondaryColor: '#333' },
                song: { title: 'Song', artist: 'Artist', duration: 200 },
                lyrics: [{ fullText: 'a', startTime: 0, endTime: 1000, words: [] }],
                showText: true,
            },
        };
        const firstReceived = nextMessage(listener);
        broadcaster!.post(config);
        await expect(firstReceived).resolves.toMatchObject({ kind: 'config', config: { song: { title: 'Song' } } });

        const clock: ObsStagePublishMessage = {
            kind: 'clock',
            clock: { currentTime: 3, sentAtMs: 1000, playerState: 'playing', duration: 200, playbackRate: 1, lyricOffsetMs: 0 },
        };
        const secondReceived = nextMessage(listener);
        broadcaster!.post(clock);
        await expect(secondReceived).resolves.toMatchObject({ kind: 'clock', clock: { currentTime: 3, playerState: 'playing' } });

        // Posting after close must be swallowed, not thrown: a tab can navigate mid-playback.
        broadcaster!.close();
        expect(() => broadcaster!.post(clock)).not.toThrow();
        listener.close();
    });
});
