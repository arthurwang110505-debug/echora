import { describe, expect, it } from "vitest";
import { colorWithAlpha, mixColors, parseColorChannels } from "./colorMix";

// The visualizer hot paths rely on two contracts: alpha is quantized to 1/128
// steps (visually imperceptible, makes continuously varying colors produce a
// small repeating set of strings that downstream caches can hit), and parsing
// plus formatting are memoized (theme colors repeat thousands of times per
// second across frames).
describe("colorMix", () => {
  it("formats hex colors with quantized alpha", () => {
    expect(colorWithAlpha("#62f5c4", 0.3)).toBe("rgba(98, 245, 196, 0.296875)");
    expect(colorWithAlpha("#62f5c4", 1)).toBe("rgba(98, 245, 196, 1)");
    expect(colorWithAlpha("#62f5c4", 0)).toBe("rgba(98, 245, 196, 0)");
  });

  it("is stable and repeatable for continuous inputs (memo contract)", () => {
    const first = colorWithAlpha("#62f5c4", 0.3333);
    const second = colorWithAlpha("#62f5c4", 0.3336);
    expect(first).toBe(second);
    expect(first).toBe(colorWithAlpha("#62f5c4", 0.3333));
  });

  it("clamps out-of-range alpha", () => {
    expect(colorWithAlpha("#ffffff", 2)).toBe("rgba(255, 255, 255, 1)");
    expect(colorWithAlpha("#ffffff", -1)).toBe("rgba(255, 255, 255, 0)");
  });

  it("passes through non color-spec strings untouched", () => {
    expect(colorWithAlpha("mint", 0.5)).toBe("mint");
    expect(colorWithAlpha("", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });

  it("parses hex and rgb inputs", () => {
    expect(parseColorChannels("#62f5c4")).toEqual({ r: 98, g: 245, b: 196 });
    expect(parseColorChannels("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseColorChannels("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColorChannels("nope")).toBeNull();
  });

  it("mixes channels and quantizes the result alpha", () => {
    expect(mixColors("#000000", "#ffffff", 0.5, 0.8)).toBe(
      "rgba(128, 128, 128, 0.796875)",
    );
    // Fallback when either side is not a parseable color spec: pick the closer
    // side and apply the alpha.
    expect(mixColors("mint", "#ffffff", 0.2, 0.5)).toBe("mint");
    expect(mixColors("mint", "#ffffff", 0.8, 0.5)).toBe(
      "rgba(255, 255, 255, 0.5)",
    );
  });
});
