// packages/web/src/api/color.test.ts
import { describe, expect, it } from 'vitest';
import { MIN_CONTRAST_RATIO, contrastRatio, ensureContrast, isHexColor } from '@api/_lib/color';

describe('isHexColor', () => {
  it('accepts the four real lengths', () => {
    for (const value of ['#fff', '#ffff', '#ffffff', '#ffffffff', '#AbC123']) {
      expect(isHexColor(value), value).toBe(true);
    }
  });

  it('refuses the lengths the old pattern let through', () => {
    // `[0-9a-f]{3,8}` accepted both of these; neither is a CSS colour.
    expect(isHexColor('#12345')).toBe(false);
    expect(isHexColor('#1234567')).toBe(false);
  });

  it('refuses anything that is not a hex colour', () => {
    for (const value of ['red', '#', '#ggg', 'rgb(0,0,0)', 'fff', 42, null]) {
      expect(isHexColor(value as unknown), String(value)).toBe(false);
    }
    // Surrounding whitespace is trimmed rather than rejected: the value comes from a model, and
    // refusing " #fff" would throw away a colour that means exactly what it says.
    expect(isHexColor(' #fff ')).toBe(true);
  });
});

describe('contrastRatio', () => {
  it('follows WCAG on the extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
  });

  it('reads the short forms', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('returns 1 for something it cannot read, so a caller gating on it refuses', () => {
    expect(contrastRatio('not-a-color', '#fff')).toBe(1);
  });
});

describe('ensureContrast', () => {
  it('leaves a readable colour alone', () => {
    expect(ensureContrast('#ffffff', '#101217')).toBe('#ffffff');
  });

  it('lightens unreadable text on a dark background', () => {
    const fixed = ensureContrast('#1a1a1a', '#101217');
    expect(fixed).not.toBe('#1a1a1a');
    expect(contrastRatio(fixed, '#101217')).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('darkens unreadable text on a light background', () => {
    const fixed = ensureContrast('#e8e8e8', '#f6f3ef');
    expect(contrastRatio(fixed, '#f6f3ef')).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('keeps the hue it was given rather than jumping to black or white', () => {
    // A dim teal on near-black should stay recognisably teal.
    const fixed = ensureContrast('#0d3a33', '#07090e');
    const [r, g, b] = [1, 3, 5].map(index => parseInt(fixed.slice(index, index + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});
