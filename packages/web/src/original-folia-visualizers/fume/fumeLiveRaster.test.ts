import { describe, expect, it } from "vitest";
import {
  resolveFumeLiveRasterBounds,
  resolveFumeLiveRasterScale,
} from "./fumeLiveRaster";

describe("Fume live raster", () => {
  it("uses a bounded scale ladder with less than 1.5% oversampling", () => {
    const octaveStep = 2 ** (1 / 48);

    for (const deviceScale of [0.2, 0.5, 0.84, 1, 1.18, 1.75, 2, 3, 4.5]) {
      const rasterScale = resolveFumeLiveRasterScale(deviceScale);
      expect(rasterScale).toBeGreaterThanOrEqual(deviceScale);
      expect(rasterScale / deviceScale).toBeLessThanOrEqual(octaveStep + 1e-10);
    }
  });

  it("crops a live block to its visible region while retaining glow padding", () => {
    const bounds = resolveFumeLiveRasterBounds(
      {
        id: "line-1",
        x: 100,
        y: 100,
        width: 300,
        height: 50,
        lineHeight: 60,
        fontPx: 48,
      },
      {
        deviceScale: 1.2,
        visible: { left: 150, top: 80, right: 420, bottom: 180 },
        glowIntensity: 1,
      },
    );

    expect(bounds).not.toBeNull();
    expect(bounds!.left).toBeGreaterThanOrEqual(150);
    expect(bounds!.top).toBeGreaterThanOrEqual(80);
    expect(bounds!.left + bounds!.worldWidth).toBeLessThanOrEqual(
      420 + 1 / bounds!.scale,
    );
    expect(bounds!.top + bounds!.worldHeight).toBeLessThanOrEqual(
      180 + 1 / bounds!.scale,
    );
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);
  });

  it("does not allocate a raster for blocks outside the visible region", () => {
    const bounds = resolveFumeLiveRasterBounds(
      {
        id: "offscreen",
        x: 1_000,
        y: 1_000,
        width: 100,
        height: 40,
        lineHeight: 48,
        fontPx: 36,
      },
      {
        deviceScale: 1,
        visible: { left: 0, top: 0, right: 200, bottom: 200 },
        glowIntensity: 1,
      },
    );

    expect(bounds).toBeNull();
  });
});
