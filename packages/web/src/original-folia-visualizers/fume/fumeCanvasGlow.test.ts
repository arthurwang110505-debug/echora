import { describe, expect, it } from "vitest";
import {
  getFumeGlowClipPadding,
  quantizeFumeCanvasBlur,
} from "./fumeCanvasGlow";

describe("Fume canvas glow workaround", () => {
  it("rounds blur radii only when the cache workaround is enabled", () => {
    expect(quantizeFumeCanvasBlur(4.6, true)).toBe(5);
    expect(quantizeFumeCanvasBlur(4.6, false)).toBe(4.6);
    expect(quantizeFumeCanvasBlur(Number.NaN, true)).toBe(0);
  });

  it("pads filtered text clips around the drop-shadow extent", () => {
    expect(
      getFumeGlowClipPadding("drop-shadow(0 0 6px rgba(255, 255, 255, 0.8))"),
    ).toBe(28);
    expect(getFumeGlowClipPadding("none")).toBe(0);
  });
});
