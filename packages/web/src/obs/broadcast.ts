import type { ObsStagePublishMessage } from './protocol';

// src/obs/broadcast.ts
//
// The zero-setup transport. A player tab and an overlay tab on the same origin and in the same
// browser profile share a BroadcastChannel, so "open the overlay in another window and capture that
// window in OBS" needs no relay, no token and no settings.
//
// It cannot replace the relay for an OBS *browser source*: that runs in its own Chromium profile,
// with its own channel, so nothing crosses. Both transports carry the same two messages.

export const OBS_STAGE_BROADCAST_CHANNEL = 'echora-obs-stage-v1';

interface BroadcastCapable {
    BroadcastChannel?: typeof BroadcastChannel;
}

export const isObsStageBroadcastAvailable = (target: unknown = globalThis): boolean => (
    typeof (target as BroadcastCapable)?.BroadcastChannel === 'function'
);

/**
 * A publisher handle. Returns null when the transport is unavailable, so callers do not have to
 * branch on the environment at every publish site.
 */
export const createObsStageBroadcaster = (): { post: (message: ObsStagePublishMessage) => void; close: () => void } | null => {
    if (!isObsStageBroadcastAvailable()) return null;
    const channel = new BroadcastChannel(OBS_STAGE_BROADCAST_CHANNEL);
    return {
        post: (message) => {
            try {
                channel.postMessage(message);
            } catch {
                // A closed channel (a tab navigating away) must not break playback.
            }
        },
        close: () => channel.close(),
    };
};
