// Folia's workaround for Chromium's animated canvas glyph-cache leak.
// The drop-shadow filter is applied outside the text strike cache, while the optional
// blur quantization keeps the fallback path's cache keys bounded.
//
// The on/off decision is NOT made here: `VisualizerFume.tsx` reads the shared switch
// `isGlowBlurQuantized()` from utils/glowBlurQuantize.ts and passes it in as `enabled` /
// `useFilter`. This module used to carry its own private `isLinuxFumeRenderer()` copy of the
// same platform rule, which meant fume was the one mode that did not leak but also the one mode
// a user could not turn the fix on for. One switch, one storage key, one platform default now.
//
// The helpers below stay fume-local on purpose: unlike upstream's `fillGlowText`, `fillFumeGlowText`
// guards every `actualBoundingBox*` metric against NaN/0 before it builds the clip rect, which is
// what keeps it working under jsdom and on canvases whose metrics are not populated yet.

const DROP_SHADOW_SIGMA = /^drop-shadow\(0 0 ([\d.]+)px /;

export const quantizeFumeCanvasBlur = (
  blur: number,
  enabled: boolean,
): number => {
  if (!Number.isFinite(blur)) return 0;
  return enabled ? Math.max(0, Math.round(blur)) : blur;
};

/** Sets a text glow and reports whether it was installed as a CSS filter. */
export const setFumeCanvasTextGlow = (
  context: CanvasRenderingContext2D,
  blur: number,
  color: string,
  useFilter: boolean,
): boolean => {
  const safeBlur = quantizeFumeCanvasBlur(blur, useFilter);
  const supportsFilter = useFilter && typeof context.filter === "string";

  if (supportsFilter) {
    // Canvas shadowBlur and CSS drop-shadow use different sigma conventions; halve the
    // radius to preserve Folia's existing appearance as closely as possible.
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    context.filter =
      safeBlur > 0 ? `drop-shadow(0 0 ${safeBlur / 2}px ${color})` : "none";
    return true;
  }

  context.filter = "none";
  context.shadowBlur = safeBlur;
  context.shadowColor = color;
  return false;
};

export const clearFumeCanvasTextGlow = (
  context: CanvasRenderingContext2D,
  usedFilter: boolean,
) => {
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  if (usedFilter) context.filter = "none";
};

/** Extra clip padding needed so a canvas filter's glow is not clipped at a text-run edge. */
export const getFumeGlowClipPadding = (filter: string): number => {
  const sigma = Number(DROP_SHADOW_SIGMA.exec(filter)?.[1] ?? 0);
  return Number.isFinite(sigma) && sigma > 0 ? sigma * 4 + 4 : 0;
};

/** Draw a filtered glow into a tight clip instead of asking Chromium to filter the full canvas. */
export const fillFumeGlowText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) => {
  const padding = getFumeGlowClipPadding(context.filter);
  if (padding === 0) {
    context.fillText(text, x, y);
    return;
  }

  const metrics = context.measureText(text);
  const left = Number.isFinite(metrics.actualBoundingBoxLeft)
    ? metrics.actualBoundingBoxLeft
    : 0;
  const right = Number.isFinite(metrics.actualBoundingBoxRight)
    ? metrics.actualBoundingBoxRight
    : metrics.width;
  const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
    ? metrics.actualBoundingBoxAscent
    : 0;
  const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
    ? metrics.actualBoundingBoxDescent
    : 0;
  const width = left + right + padding * 2;
  const height = ascent + descent + padding * 2;

  if (width <= 0 || height <= 0) {
    context.fillText(text, x, y);
    return;
  }

  context.save();
  context.beginPath();
  context.rect(x - left - padding, y - ascent - padding, width, height);
  context.clip();
  context.fillText(text, x, y);
  context.restore();
};
