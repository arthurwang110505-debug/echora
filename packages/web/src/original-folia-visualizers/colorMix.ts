// src/components/visualizer/colorMix.ts
// Shared color helpers for visualizer renderers.
//
// Performance note: these helpers sit on the hot path of every per-frame lyric
// renderer (Fume canvas runs, Claddagh DOM writes, Cadenza glow spans). Two
// properties keep them cheap without changing what the user sees:
// 1. Alpha is quantized to 1/128 steps before formatting. That is well under
//    one 8-bit alpha step of drift per change, so it is visually imperceptible,
//    while continuously varying inputs now produce a small set of repeating
//    strings that downstream caches (style caches, canvas state churn) can hit.
// 2. Hex/rgb parsing and the final string formatting are memoized. Lyric
//    renderers reuse a handful of theme colors across thousands of calls per
//    second, so the memo hit rate is near 100% in practice.
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
const FALLBACK_RGB = { r: 255, g: 255, b: 255 };

const isFiniteChannel = (value: number) => Number.isFinite(value);

// 1/128 alpha steps: max drift of ~0.4% alpha, invisible on any display.
const ALPHA_QUANTUM_STEPS = 128;
const formatAlpha = (alpha: number) =>
  Math.round(clamp(alpha, 0, 1) * ALPHA_QUANTUM_STEPS) / ALPHA_QUANTUM_STEPS;

const RGBA_STRING_CACHE_LIMIT = 8192;
const rgbaStringCache = new Map<string, string>();

const formatRgba = (
  channels: { r: number; g: number; b: number },
  alpha: number,
) => {
  const r = Math.round(clamp(channels.r, 0, 255));
  const g = Math.round(clamp(channels.g, 0, 255));
  const b = Math.round(clamp(channels.b, 0, 255));
  const quantizedAlpha = formatAlpha(alpha);
  const cacheKey = `${r},${g},${b},${quantizedAlpha}`;
  const cached = rgbaStringCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // toFixed-free shortest round-trip: quantized alphas print compactly
  // (0.5546875) and repeat, which is what downstream caches rely on.
  const formatted = `rgba(${r}, ${g}, ${b}, ${quantizedAlpha})`;
  if (rgbaStringCache.size >= RGBA_STRING_CACHE_LIMIT) {
    rgbaStringCache.clear();
  }
  rgbaStringCache.set(cacheKey, formatted);
  return formatted;
};

interface ParsedColorChannels {
  r: number;
  g: number;
  b: number;
}

const COLOR_PARSE_CACHE_LIMIT = 4096;
const colorParseCache = new Map<string, ParsedColorChannels | null>();

const parseColorChannelsUncached = (
  normalizedColor: string,
): ParsedColorChannels | null => {
  if (normalizedColor.startsWith("#")) {
    const hex = normalizedColor.slice(1);
    const parse = (value: string) => Number.parseInt(value, 16);

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return {
        r: parse(hex[0] + hex[0]),
        g: parse(hex[1] + hex[1]),
        b: parse(hex[2] + hex[2]),
      };
    }

    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        r: parse(hex.slice(0, 2)),
        g: parse(hex.slice(2, 4)),
        b: parse(hex.slice(4, 6)),
      };
    }
  }

  const rgbMatch = normalizedColor.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Number.parseFloat(part.trim()));
    if ([r, g, b].every(isFiniteChannel)) {
      return { r: r!, g: g!, b: b! };
    }
  }

  return null;
};

const parseColorChannelsCached = (
  normalizedColor: string,
): ParsedColorChannels | null => {
  const cached = colorParseCache.get(normalizedColor);
  if (cached !== undefined) {
    return cached;
  }
  const parsed = parseColorChannelsUncached(normalizedColor);
  if (colorParseCache.size >= COLOR_PARSE_CACHE_LIMIT) {
    colorParseCache.clear();
  }
  colorParseCache.set(normalizedColor, parsed);
  return parsed;
};

export const colorWithAlpha = (color: string, alpha: number) => {
  const normalizedAlpha = clamp(alpha, 0, 1);
  const normalizedColor = typeof color === "string" ? color.trim() : "";
  if (!normalizedColor) {
    return formatRgba(FALLBACK_RGB, normalizedAlpha);
  }

  const channels = parseColorChannelsCached(normalizedColor);
  if (channels) {
    return formatRgba(channels, normalizedAlpha);
  }
  return normalizedColor;
};

export const parseColorChannels = (color: string) => {
  const normalizedColor = typeof color === "string" ? color.trim() : "";
  if (!normalizedColor) {
    return null;
  }
  return parseColorChannelsCached(normalizedColor);
};

export const mixColors = (
  from: string,
  to: string,
  amount: number,
  alpha = 1,
) => {
  const normalizedAmount = clamp(amount, 0, 1);
  const fromChannels = parseColorChannels(from);
  const toChannels = parseColorChannels(to);

  if (!fromChannels || !toChannels) {
    return colorWithAlpha(normalizedAmount >= 0.5 ? to : from, alpha);
  }

  return formatRgba(
    {
      r: mix(fromChannels.r, toChannels.r, normalizedAmount),
      g: mix(fromChannels.g, toChannels.g, normalizedAmount),
      b: mix(fromChannels.b, toChannels.b, normalizedAmount),
    },
    alpha,
  );
};
