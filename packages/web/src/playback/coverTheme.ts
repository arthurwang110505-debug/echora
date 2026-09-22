import type { ThemeConfig } from '@echora/core';

// src/playback/coverTheme.ts
// Cover-colour theme fallback used when no AI service is configured — the same behaviour the
// guide describes ("没有接入任何 AI 服务时…会回退到使用封面取色方案"). Everything here is pure
// and deterministic: pixels in, theme out, so it can be unit-tested without a DOM image.

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const rgbToHex = ({ r, g, b }: Rgb) => (
  `#${[r, g, b].map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('')}`
);

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60) % 360, s, l };
};

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
};

/** Stable hue from any string, used when the cover pixels cannot be read at all. */
export const hueFromSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return hash % 360;
};

/**
 * Builds a theme from raw RGBA pixels. The accent is the most chromatic colour that is neither
 * near-black nor blown out; the background is the darkest colour present; primary/secondary are
 * tints of the accent so the stage keeps readable contrast on both.
 */
export const themeFromPixels = (pixels: Uint8ClampedArray, name: string): ThemeConfig => {
  let accent: Hsl = { h: 200, s: 0.5, l: 0.55 };
  let accentScore = -1;
  let background: Hsl = { h: accent.h, s: 0.2, l: 0.07 };
  let darkest = Number.POSITIVE_INFINITY;
  let sampled = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    sampled += 1;
    const hsl = rgbToHsl({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
    // Reward saturation and mid lightness; ignore near-white and near-black pixels as accents.
    const lightnessWeight = 1 - Math.abs(hsl.l - 0.5) * 1.4;
    const score = hsl.s * Math.max(lightnessWeight, 0.05);
    if (score > accentScore) {
      accentScore = score;
      accent = hsl;
    }
    if (hsl.l < darkest) {
      darkest = hsl.l;
      background = { h: hsl.h, s: Math.min(hsl.s, 0.35), l: Math.min(hsl.l, 0.1) };
    }
  }

  if (sampled === 0) return themeFromSeed(name, name);

  return {
    name,
    backgroundColor: rgbToHex(hslToRgb({ ...background, l: clamp(background.l, 0.04, 0.12) })),
    primaryColor: rgbToHex(hslToRgb({ h: accent.h, s: clamp(accent.s * 0.35, 0.05, 0.4), l: 0.94 })),
    accentColor: rgbToHex(hslToRgb({ h: accent.h, s: clamp(accent.s, 0.45, 0.95), l: clamp(accent.l, 0.45, 0.68) })),
    secondaryColor: rgbToHex(hslToRgb({ h: accent.h, s: clamp(accent.s * 0.55, 0.1, 0.6), l: 0.62 })),
    fontStyle: 'sans',
    provider: 'Echora',
  };
};

/** Deterministic theme when the cover is unreadable (tainted canvas, blocked image, no cover). */
export const themeFromSeed = (seed: string, name: string): ThemeConfig => {
  const h = hueFromSeed(seed || name);
  return {
    name,
    backgroundColor: rgbToHex(hslToRgb({ h, s: 0.28, l: 0.07 })),
    primaryColor: rgbToHex(hslToRgb({ h, s: 0.2, l: 0.94 })),
    accentColor: rgbToHex(hslToRgb({ h, s: 0.72, l: 0.6 })),
    secondaryColor: rgbToHex(hslToRgb({ h: (h + 24) % 360, s: 0.45, l: 0.62 })),
    fontStyle: 'sans',
    provider: 'Echora',
  };
};

/**
 * Reads the cover into 32×32 pixels. Returns null when the canvas would be tainted or the image
 * fails to load — callers then fall back to `themeFromSeed`.
 */
export const sampleCoverPixels = (coverUrl: string): Promise<Uint8ClampedArray | null> => (
  new Promise(resolve => {
    if (!coverUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 32, 32);
        resolve(ctx.getImageData(0, 0, 32, 32).data);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = coverUrl;
  })
);
