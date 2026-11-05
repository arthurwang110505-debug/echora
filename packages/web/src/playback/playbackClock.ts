// src/playback/playbackClock.ts
//
// The 60 Hz clock the stage animates from, for local playback.
//
// Why this exists: `<audio>` only fires `timeupdate` about four times a second, so
// `playerStore.currentTime` is a value that changes ~4x/s. The stage samples its clock once
// per frame (OriginalFoliaVisualizerStage's rAF), but the value it was sampling was that
// 4 Hz store field - so every per-glyph animation advanced in 250 ms steps. The scene ran at
// 60 fps and read a clock that ticked four times a second, which is what "it stutters" means.
//
// The fix is the one upstream uses (usePlaybackVisualizerBridge): read the media element's
// own `currentTime` every frame. It is the browser's authoritative playback position, it is
// continuous, and reading it costs a property access on an object the browser already keeps
// up to date for its own rendering.
//
// This module deliberately holds the *element*, not the value:
//
//   - it is a module-level slot, so the reader is a stable function identity that never needs
//     to appear in an effect's dependency array;
//   - nothing is subscribed to and nothing re-renders: the stage's existing rAF calls it;
//   - the store keeps its ~4 Hz `currentTime` for everything that wants a low-frequency value
//     (progress text, Media Session, the playback snapshot). Those must not become 60 Hz.
//
// It only answers for the element it was given. A visualizer source (YouTube, Spotify) has no
// `<audio>` element, so the reader reports "no clock" and the stage keeps using its prop.

let clockElement: HTMLAudioElement | null = null;

/** Called by LocalAudioController on mount / unmount. One element per document. */
export const setPlaybackClockElement = (element: HTMLAudioElement | null): void => {
    clockElement = element;
};

/**
 * True when a local element is registered, so a caller can decide whether the reader is
 * meaningful. The stage does not need this - it only needs the reading to be null - but
 * diagnostics and tests do.
 */
export const hasPlaybackClock = (): boolean => clockElement !== null;

/**
 * The element's position in seconds, or null when there is nothing to read.
 *
 * Null covers three cases that all mean "not mine to answer": no element, a remote source
 * being played, and the element being torn down. Callers treat null as "no opinion this
 * frame" and fall back to their prop.
 */
export const getPlaybackClockReading = (): number | null => {
    const element = clockElement;
    if (!element) return null;
    // `currentTime` on a detached or not-yet-loaded element is 0, not an error, so there is
    // nothing to guard beyond the finite check.
    const seconds = element.currentTime;
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
};
