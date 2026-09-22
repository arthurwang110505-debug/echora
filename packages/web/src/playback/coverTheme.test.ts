import { describe, expect, it } from 'vitest';
import { hslToRgb, hueFromSeed, rgbToHex, rgbToHsl, themeFromPixels, themeFromSeed } from './coverTheme';

/** Solid-colour RGBA buffer, 4 bytes per pixel. */
const solid = (r: number, g: number, b: number, pixels = 8) => {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
};

const HEX = /^#[0-9a-f]{6}$/;

describe('cover theme extraction', () => {
  it('round-trips rgb → hsl → rgb', () => {
    for (const rgb of [{ r: 200, g: 40, b: 90 }, { r: 12, g: 130, b: 220 }, { r: 250, g: 250, b: 250 }]) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it('formats hex with leading zeroes', () => {
    expect(rgbToHex({ r: 0, g: 8, b: 255 })).toBe('#0008ff');
  });

  it('builds a valid theme whose accent follows the cover colour', () => {
    const theme = themeFromPixels(solid(220, 40, 40), '紅');
    const colorFields = ['backgroundColor', 'primaryColor', 'accentColor', 'secondaryColor'] as const;
    for (const field of colorFields) {
      expect(theme[field]).toMatch(HEX);
    }
    expect(theme.name).toBe('紅');
    expect(theme.provider).toBe('Echora');
    // A red cover must not produce a blue accent.
    const accent = theme.accentColor;
    expect(parseInt(accent.slice(1, 3), 16)).toBeGreaterThan(parseInt(accent.slice(5, 7), 16));
  });

  it('keeps the background dark so stage text stays readable', () => {
    const theme = themeFromPixels(solid(250, 250, 250), 'white cover');
    const l = parseInt(theme.backgroundColor.slice(5, 7), 16);
    expect(l).toBeLessThan(0x40);
  });

  it('falls back to a seed-derived theme for an empty buffer', () => {
    const theme = themeFromPixels(new Uint8ClampedArray(0), 'empty');
    expect(theme.name).toBe('empty');
    expect(theme.accentColor).toMatch(HEX);
  });

  it('is deterministic per seed and stable across calls', () => {
    expect(hueFromSeed('local:demo-1')).toBe(hueFromSeed('local:demo-1'));
    expect(hueFromSeed('local:demo-1')).not.toBe(hueFromSeed('local:demo-2'));
    expect(themeFromSeed('local:demo-1', 'x')).toEqual(themeFromSeed('local:demo-1', 'x'));
  });
});
