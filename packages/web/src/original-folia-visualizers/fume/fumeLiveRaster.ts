// Adapted from Folia's Fume live-raster fix (79acac15).
// The camera can keep moving smoothly while active lyrics are rasterized at a small,
// finite set of device scales. This avoids generating a new glyph strike at every zoom.

const LIVE_IDLE_MS = 5_000;
const LIVE_CANVAS_GRANULE = 256;
const LIVE_RASTER_LEVELS_PER_OCTAVE = 48;

export interface FumeLiveRasterBlockBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lineHeight: number;
  fontPx: number;
}

export interface FumeLiveRasterFrame {
  /** Device pixels per world unit at the current camera zoom. */
  deviceScale: number;
  /** Visible world-space rectangle, including a small entry margin. */
  visible: { left: number; top: number; right: number; bottom: number };
  glowIntensity: number;
}

export interface FumeLiveRasterBounds {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
}

export interface FumeLiveRasterTarget extends FumeLiveRasterBounds {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

interface LiveCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  lastUsed: number;
  usedWidth: number;
  usedHeight: number;
}

/** The next raster scale at or above `deviceScale`, with less than 1.5% oversampling. */
export const resolveFumeLiveRasterScale = (deviceScale: number): number => {
  const safeScale =
    Number.isFinite(deviceScale) && deviceScale > 0 ? deviceScale : 1e-3;
  return (
    2 **
    (Math.ceil(
      Math.log2(Math.max(safeScale, 1e-3)) * LIVE_RASTER_LEVELS_PER_OCTAVE -
        1e-9,
    ) /
      LIVE_RASTER_LEVELS_PER_OCTAVE)
  );
};

/** Resolve a live block's cropped offscreen canvas rectangle without touching the DOM. */
export const resolveFumeLiveRasterBounds = (
  block: FumeLiveRasterBlockBounds,
  frame: FumeLiveRasterFrame,
): FumeLiveRasterBounds | null => {
  const scale = resolveFumeLiveRasterScale(frame.deviceScale);
  const glowReach =
    (12 + block.fontPx * 0.7) * Math.max(frame.glowIntensity, 1) * 1.5;
  const padding = Math.ceil(
    block.lineHeight * 0.5 + glowReach / Math.max(scale, 0.01),
  );
  const left = Math.max(block.x - padding, frame.visible.left);
  const top = Math.max(block.y - padding, frame.visible.top);
  const right = Math.min(block.x + block.width + padding, frame.visible.right);
  const bottom = Math.min(
    block.y + block.height + padding,
    frame.visible.bottom,
  );

  if (
    ![left, top, right, bottom].every(Number.isFinite) ||
    right <= left ||
    bottom <= top
  ) {
    return null;
  }

  const width = Math.max(1, Math.ceil((right - left) * scale));
  const height = Math.max(1, Math.ceil((bottom - top) * scale));
  return {
    scale,
    left,
    top,
    width,
    height,
    worldWidth: width / scale,
    worldHeight: height / scale,
  };
};

export class FumeLiveRaster {
  private readonly canvases = new Map<string, LiveCanvas>();

  begin(
    block: FumeLiveRasterBlockBounds,
    frame: FumeLiveRasterFrame,
    now: number,
  ): FumeLiveRasterTarget | null {
    const bounds = resolveFumeLiveRasterBounds(block, frame);
    if (!bounds) return null;

    const live = this.ensure(block.id, bounds.width, bounds.height);
    const { context } = live;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(
      0,
      0,
      Math.max(live.usedWidth, bounds.width),
      Math.max(live.usedHeight, bounds.height),
    );
    context.setTransform(
      bounds.scale,
      0,
      0,
      bounds.scale,
      -bounds.left * bounds.scale,
      -bounds.top * bounds.scale,
    );
    live.usedWidth = bounds.width;
    live.usedHeight = bounds.height;
    live.lastUsed = now;

    return { ...bounds, canvas: live.canvas, context };
  }

  /** Release block canvases that have not been used recently. */
  sweep(now: number) {
    for (const [id, live] of this.canvases) {
      if (now - live.lastUsed <= LIVE_IDLE_MS) continue;
      live.canvas.width = 0;
      live.canvas.height = 0;
      this.canvases.delete(id);
    }
  }

  clear() {
    this.sweep(Number.POSITIVE_INFINITY);
  }

  private ensure(id: string, width: number, height: number) {
    const current = this.canvases.get(id);
    if (
      current &&
      current.canvas.width >= width &&
      current.canvas.height >= height
    )
      return current;

    const canvas = current?.canvas ?? document.createElement("canvas");
    canvas.width =
      Math.ceil(
        Math.max(width, current?.canvas.width ?? 0) / LIVE_CANVAS_GRANULE,
      ) * LIVE_CANVAS_GRANULE;
    canvas.height =
      Math.ceil(
        Math.max(height, current?.canvas.height ?? 0) / LIVE_CANVAS_GRANULE,
      ) * LIVE_CANVAS_GRANULE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Fume live text canvas is unavailable");
    const live = { canvas, context, lastUsed: 0, usedWidth: 0, usedHeight: 0 };
    this.canvases.set(id, live);
    return live;
  }
}
