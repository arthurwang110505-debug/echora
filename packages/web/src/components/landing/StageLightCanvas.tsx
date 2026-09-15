import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * StageLightCanvas — a volumetric "moving-head" stage light show rendered on
 * canvas. It indirectly previews Echora's player stage: sweeping light beams,
 * a beat-synced pulse (~96 BPM), sliding floor light pools and rising dust.
 *
 * Performance / safety notes:
 * - DPR capped at 1.75; additive drawing is cheap (a handful of gradients).
 * - Pauses via visibilitychange; renders a single static frame when the user
 *   prefers reduced motion.
 * - Beams subtly tilt toward the pointer for an interactive feel.
 */

const PALETTE: Array<[number, number, number]> = [
  [98, 245, 196], // mint (brand)
  [45, 212, 191], // teal
  [56, 189, 248], // sky
  [129, 140, 248], // indigo
  [167, 139, 250], // violet
];

const BEAM_COUNT = 6;
const BPM = 96;
const PARTICLE_COUNT = 64;

interface Beam {
  originX: number; // 0..1 across width
  originY: number; // 0..1 across height
  baseAngle: number; // radians, measured from straight-down
  sweepAmp: number;
  sweepSpeed: number;
  phase: number;
  spread: number; // fan half-width in radians
  length: number; // fraction of scene height
  colorIndex: number;
  intensity: number;
}

const BEAMS: Beam[] = Array.from({ length: BEAM_COUNT }, (_, index) => {
  // Two trusses: three fixtures hang from the upper-left, three from the upper-right.
  const leftSide = index < BEAM_COUNT / 2;
  const t = index % (BEAM_COUNT / 2);
  return {
    originX: leftSide ? 0.06 + t * 0.1 : 0.94 - t * 0.1,
    originY: leftSide ? -0.04 + t * 0.02 : -0.02 + (1 - t) * 0.02,
    baseAngle: (leftSide ? 1 : -1) * (0.34 + t * 0.16),
    sweepAmp: 0.5 + (index % 3) * 0.14,
    sweepSpeed: 0.16 + (index % 4) * 0.045,
    phase: index * 1.7,
    spread: 0.052 + (index % 3) * 0.012,
    length: 0.95 - (index % 3) * 0.08,
    colorIndex: index % PALETTE.length,
    intensity: 0.75 + (index % 3) * 0.12,
  };
});

interface Particle {
  x: number; // 0..1
  y: number; // 0..1
  radius: number;
  speed: number;
  drift: number;
  phase: number;
}

const PARTICLES: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
  x: Math.random(),
  y: Math.random(),
  radius: 0.6 + Math.random() * 1.8,
  speed: 0.008 + Math.random() * 0.02,
  drift: (Math.random() - 0.5) * 0.012,
  phase: Math.random() * Math.PI * 2,
}));

interface SceneState {
  width: number;
  height: number;
  pointerX: number; // -1..1
  pointerY: number;
  tiltX: number; // smoothed pointer influence
  tiltY: number;
}

export default function StageLightCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const state: SceneState = { width: 0, height: 0, pointerX: 0, pointerY: 0, tiltX: 0, tiltY: 0 };
    let frame = 0;
    let running = true;

    const rgba = (color: [number, number, number], alpha: number) =>
      `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      state.width = parent.clientWidth;
      state.height = parent.clientHeight;
      canvas.width = Math.max(1, Math.round(state.width * dpr));
      canvas.height = Math.max(1, Math.round(state.height * dpr));
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      const { width, height } = state;
      if (width < 2 || height < 2) return;

      const seconds = time / 1000;
      const beats = (seconds * BPM) / 60;
      const beatPhase = beats % 1;
      const barIndex = Math.floor(beats / 4);
      // Sharp attack, quick decay — reads like a lighting "hit" on each beat.
      const hit = Math.pow(1 - beatPhase, 3);
      const downbeat = barIndex % 4 === 0 ? 1.15 : 1;
      const pulse = hit * downbeat;
      const floorY = height * 0.965;

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      // --- Moving-head beams -------------------------------------------------
      for (const beam of BEAMS) {
        const sweep = Math.sin(seconds * beam.sweepSpeed * Math.PI * 2 + beam.phase) * beam.sweepAmp;
        const angle = beam.baseAngle + sweep + state.tiltX * 0.1;
        // Scene color slowly rotates every 4 bars, like a lighting console cue.
        const sceneShift = Math.floor(barIndex / 4) % PALETTE.length;
        const color = PALETTE[(beam.colorIndex + sceneShift) % PALETTE.length];

        const ox = beam.originX * width;
        const oy = beam.originY * height;
        const length = beam.length * Math.max(width, height) * 1.05;
        const dirX = Math.sin(angle);
        const dirY = Math.cos(angle);
        const endX = ox + dirX * length;
        const endY = oy + dirY * length;
        const spread = beam.spread + state.tiltY * 0.004;
        const leftAngle = angle - spread;
        const rightAngle = angle + spread;

        const alpha = (0.05 + pulse * 0.055) * beam.intensity;
        const gradient = context.createLinearGradient(ox, oy, endX, endY);
        gradient.addColorStop(0, rgba(color, Math.min(0.4, alpha * 2.4)));
        gradient.addColorStop(0.35, rgba(color, alpha));
        gradient.addColorStop(1, rgba(color, 0));

        context.beginPath();
        context.moveTo(ox, oy);
        context.lineTo(ox + Math.sin(leftAngle) * length, oy + Math.cos(leftAngle) * length);
        context.lineTo(ox + Math.sin(rightAngle) * length, oy + Math.cos(rightAngle) * length);
        context.closePath();
        context.fillStyle = gradient;
        context.fill();

        // Bright core line inside the beam.
        const coreGradient = context.createLinearGradient(ox, oy, endX, endY);
        coreGradient.addColorStop(0, rgba([236, 253, 245], Math.min(0.5, 0.16 + pulse * 0.16)));
        coreGradient.addColorStop(1, rgba([236, 253, 245], 0));
        context.strokeStyle = coreGradient;
        context.lineWidth = 1.4;
        context.beginPath();
        context.moveTo(ox, oy);
        context.lineTo(endX, endY);
        context.stroke();

        // Light pool where the beam lands on the stage floor.
        if (dirY > 0.05) {
          const travel = (floorY - oy) / dirY;
          const landX = ox + dirX * travel;
          if (landX > -width * 0.25 && landX < width * 1.25) {
            const poolRadius = 70 + spread * width * 1.4;
            const pool = context.createRadialGradient(landX, floorY, 0, landX, floorY, poolRadius);
            pool.addColorStop(0, rgba(color, 0.05 + pulse * 0.05));
            pool.addColorStop(1, rgba(color, 0));
            context.fillStyle = pool;
            context.beginPath();
            context.ellipse(landX, floorY, poolRadius, poolRadius * 0.26, 0, 0, Math.PI * 2);
            context.fill();
          }
        }
      }

      // --- Rising dust -------------------------------------------------------
      for (const particle of PARTICLES) {
        const life = (seconds * particle.speed + 1 - particle.y) % 1;
        const x = ((particle.x + seconds * particle.drift) % 1 + 1) % 1;
        const y = 1 - life;
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(seconds * 0.8 + particle.phase));
        const size = particle.radius * (0.75 + twinkle * 0.5);
        const glow = context.createRadialGradient(x * width, y * height, 0, x * width, y * height, size * 4);
        glow.addColorStop(0, rgba([190, 242, 220], 0.34 * twinkle * (0.8 + pulse * 0.4)));
        glow.addColorStop(1, rgba([190, 242, 220], 0));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x * width, y * height, size * 4, 0, Math.PI * 2);
        context.fill();
      }

      // --- Stage floor line ----------------------------------------------------
      const floorGradient = context.createLinearGradient(0, 0, width, 0);
      floorGradient.addColorStop(0, rgba(PALETTE[0], 0));
      floorGradient.addColorStop(0.5, rgba(PALETTE[0], 0.32 + pulse * 0.22));
      floorGradient.addColorStop(1, rgba(PALETTE[3], 0));
      context.fillStyle = floorGradient;
      context.fillRect(0, floorY, width, 1.6);
      const floorGlow = context.createLinearGradient(0, floorY - 42, 0, floorY + 2);
      floorGlow.addColorStop(0, rgba(PALETTE[0], 0));
      floorGlow.addColorStop(1, rgba(PALETTE[0], 0.05 + pulse * 0.05));
      context.fillStyle = floorGlow;
      context.fillRect(0, floorY - 42, width, 44);

      // --- Vignette (keeps overlay text readable) ------------------------------
      context.globalCompositeOperation = 'source-over';
      const vignette = context.createRadialGradient(
        width / 2, height * 0.42, Math.min(width, height) * 0.32,
        width / 2, height * 0.5, Math.max(width, height) * 0.78,
      );
      vignette.addColorStop(0, 'rgba(7, 9, 14, 0)');
      vignette.addColorStop(1, 'rgba(7, 9, 14, 0.62)');
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
    };

    const loop = (time: number) => {
      if (!running) return;
      // Smooth pointer tilt (lerp) for a premium, weighted feel.
      state.tiltX += (state.pointerX - state.tiltX) * 0.04;
      state.tiltY += (state.pointerY - state.tiltY) * 0.04;
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running && frame === 0 && !document.hidden) {
        frame = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const handlePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      state.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      state.pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };

    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      resize();
      if (prefersReducedMotion) draw(performance.now());
    }) : null;
    if (canvas.parentElement && observer) observer.observe(canvas.parentElement);

    if (prefersReducedMotion) {
      // One calm static frame — no loops for reduced-motion users.
      draw(performance.now());
    } else {
      window.addEventListener('pointermove', handlePointer, { passive: true });
      document.addEventListener('visibilitychange', handleVisibility);
      start();
    }

    return () => {
      running = false;
      stop();
      if (observer) observer.disconnect();
      window.removeEventListener('pointermove', handlePointer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [prefersReducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
