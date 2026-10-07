// Ported from Project Folia (AGPL-3.0) — https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/subtitleFontSizes.ts
//
// The single source for the two bottom-subtitle clamps (translation / next-line preview). Before
// this, every mode carried its own copy, so changing a size meant editing five files.
//
// Both are `clamp(min, preferred, max)`: the lower bound keeps the text readable on narrow screens,
// the upper bound keeps it off the screen edge. The `vw` middle value scales with the frame at
// ordinary aspect ratios - a fixed `rem` reads too small on a large display and too large in a
// small window.
//
// Echora note: `VisualizerSonnet` used `clamp(1.05rem, 2.2vw, 1.25rem)` for the translation and
// `clamp(0.9rem, 1.8vw, 1.05rem)` for the preview; cadenza, diorama and tilt already use the values
// below. Upstream's rule is that these two numbers must be identical in every mode, or the subtitles
// resize with a visible jump when the user switches modes - so sonnet adopts the shared values here,
// and the remaining copies (fume, partita, classic, cappella) are listed in
// docs/tempera-port.zh-TW.md as the next step rather than changed in the same breath.

type SubtitleFontSizes = {
    translationFontSize: string;
    upcomingFontSize: string;
};

const clampSize = (min: number, preferred: number, max: number, scale: number): string => (
    `clamp(${(min * scale).toFixed(3)}rem, ${(preferred * scale).toFixed(3)}vw, ${(max * scale).toFixed(3)}rem)`
);

/**
 * Translation / next-line preview sizes. `lyricsFontScale` is the host's lyric size multiplier,
 * 1 by default.
 */
export const resolveSubtitleFontSizes = (lyricsFontScale = 1): SubtitleFontSizes => {
    const scale = Number.isFinite(lyricsFontScale) && lyricsFontScale > 0 ? lyricsFontScale : 1;
    return {
        translationFontSize: clampSize(1.125, 2.6, 1.25, scale),
        upcomingFontSize: clampSize(0.875, 2, 1, scale),
    };
};
