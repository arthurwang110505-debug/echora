// api/_lib/color.ts
//
// Hex colour validation and the contrast check the AI theme endpoint was missing.
//
// Two separate bugs, both from the same review:
//
//   1. `/^#[0-9a-f]{3,8}$/i` accepts 5 and 7 digit codes (`#12345`, `#1234567`). No CSS colour is
//      five digits long, so those values reach the DOM as invalid and the element falls back to
//      whatever the cascade says - which for a theme is almost never what was intended.
//   2. Nothing compared `backgroundColor` against `primaryColor`. A model is free to answer with
//      two near-identical colours, and the result is a lyric stage where the words are invisible.
//      The model has no idea this matters; the check has to be here.

/** 3, 4, 6 or 8 digits: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. Nothing else. */
export const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value.trim());

type Rgb = { r: number; g: number; b: number };

/** Expands a 3/4 digit code to 6/8, then reads the first three channels. */
const parseRgb = (hex: string): Rgb | null => {
  if (!isHexColor(hex)) return null;
  const digits = hex.trim().slice(1);
  const expanded = digits.length <= 4
    ? digits.split('').map(digit => digit + digit).join('')
    : digits;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
};

/** WCAG relative luminance. */
const luminance = ({ r, g, b }: Rgb): number => {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/**
 * WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white).
 *
 * Returns 1 for anything unparseable, which is the safe direction: a caller that gates on
 * "ratio >= 4.5" will reject it.
 */
export const contrastRatio = (foreground: string, background: string): number => {
  const a = parseRgb(foreground);
  const b = parseRgb(background);
  if (!a || !b) return 1;
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
};

/** The AA threshold for body text. Lyrics are large, but they are also the entire content. */
export const MIN_CONTRAST_RATIO = 4.5;

/**
 * Pushes `foreground` away from `background` until it clears `target`, keeping its hue.
 *
 * Mixing toward white or black - whichever direction the current colour is already leaning - is the
 * smallest change that preserves the palette the model chose. Returns the input unchanged when it
 * already passes, so a good theme is never touched.
 */
export const ensureContrast = (foreground: string, background: string, target = MIN_CONTRAST_RATIO): string => {
  if (contrastRatio(foreground, background) >= target) return foreground;
  const rgb = parseRgb(foreground);
  const backgroundLuminance = luminance(parseRgb(background) ?? { r: 0, g: 0, b: 0 });
  if (!rgb) return foreground;

  // Go toward the far end from the background: light text on a dark background gets lighter.
  const towardWhite = backgroundLuminance < 0.5;
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  for (let step = 1; step <= 20; step += 1) {
    const amount = step / 20;
    const mix = (channel: number) => (towardWhite
      ? channel + (255 - channel) * amount
      : channel * (1 - amount));
    const candidate = `#${hex(mix(rgb.r))}${hex(mix(rgb.g))}${hex(mix(rgb.b))}`;
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  // Nothing cleared it; fall back to the extreme, which always has the most contrast available.
  return towardWhite ? '#ffffff' : '#000000';
};
