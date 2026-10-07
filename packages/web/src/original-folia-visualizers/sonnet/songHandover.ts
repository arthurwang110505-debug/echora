// src/original-folia-visualizers/sonnet/songHandover.ts
//
// Upstream Folia swaps songs with a dissolve instead of a cut: `songHandover.ts` holds the outgoing
// picture for `SONNET_SONG_SWAP_MS` while the incoming program builds, so a track change reads as a
// crossfade rather than a blank frame followed by a new picture.
//
// The curve lives here as a pure function so the shape is testable without a WebGL context; the
// runtime owns the containers and only asks this module where the dissolve is at a given time.

/** Duration of the outgoing/incoming dissolve. Matches upstream's `SONNET_SONG_SWAP_MS`. */
export const SONNET_SONG_SWAP_MS = 560;

export interface SonnetHandoverFrame {
    /** Alpha for the picture being replaced. */
    outgoingAlpha: number;
    /** Alpha for the picture being built. */
    incomingAlpha: number;
    /** True once the dissolve has finished and the outgoing picture can be destroyed. */
    done: boolean;
}

const DONE: SonnetHandoverFrame = { outgoingAlpha: 0, incomingAlpha: 1, done: true };

/**
 * Resolves the dissolve at `elapsedMs` into the swap.
 *
 * The two alphas share one eased curve, so they always sum to 1: the frame never dips darker than
 * either picture on its own, which is what a naive pair of independent fades gets wrong.
 *
 * Unusable input resolves to "finished" rather than to a partial state, so a bad clock can only
 * cut the dissolve short, never freeze the outgoing picture over the new one.
 */
export const resolveSonnetHandoverFrame = (
    elapsedMs: number,
    durationMs: number = SONNET_SONG_SWAP_MS,
): SonnetHandoverFrame => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return DONE;
    if (!Number.isFinite(elapsedMs)) return DONE;
    if (elapsedMs <= 0) return { outgoingAlpha: 1, incomingAlpha: 0, done: false };
    if (elapsedMs >= durationMs) return DONE;

    const t = elapsedMs / durationMs;
    // Smoothstep: zero slope at both ends, so the dissolve does not visibly start or stop.
    const eased = t * t * (3 - 2 * t);
    return { outgoingAlpha: 1 - eased, incomingAlpha: eased, done: false };
};
