import { useEffect, useRef } from 'react';
import { getVisualizer, type ThemeConfig, type VisualizerContext } from '@echora/core';

/**
 * ModeCanvas — runs one of Echora's real ambient visualizer engines
 * (`@echora/core` visualizerRegistry) on the landing. The Modes act scrubs
 * `modeId` and `theme` with the scrollbar, so the jury sees the actual
 * product renderers rather than screenshots.
 */

export interface ModeCanvasProps {
  modeId: string;
  theme: ThemeConfig;
  /** 0..1 playback energy; drives the renderers' "isMoving" / progress hooks. */
  getProgress?: () => number;
  className?: string;
  active?: boolean;
}

export default function ModeCanvas({ modeId, theme, getProgress, className = '', active = true }: ModeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ modeId, theme, getProgress, active });
  propsRef.current = { modeId, theme, getProgress, active };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    let frame = 0;
    let running = true;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const context2d = canvas.getContext('2d');

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context2d?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const loop = () => {
      if (!running) return;
      const { modeId: id, theme: activeTheme, getProgress: progressFn, active: isActive } = propsRef.current;
      if (isActive && width > 1 && height > 1) {
        const definition = getVisualizer(id);
        if (definition) {
          const ctx: VisualizerContext = {
            canvas,
            width,
            height,
            dpr,
            lines: [],
            currentIndex: 0,
            progress: progressFn ? progressFn() : 0.6,
            theme: activeTheme,
          };
          try {
            definition.render(ctx, definition.defaultParams);
          } catch {
            // A renderer failure must never take the landing down.
          }
        }
      }
      frame = window.requestAnimationFrame(loop);
    };

    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (canvas.parentElement && observer) observer.observe(canvas.parentElement);
    frame = window.requestAnimationFrame(loop);
    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
