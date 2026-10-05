import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * Landing scroll system: Lenis smooth scrolling feeding GSAP ScrollTrigger.
 * Scroll position is the landing's "playhead" — every act is a scrubbed,
 * pinned timeline. Both are skipped under reduced motion (native scroll,
 * static acts) and are inert without a window (SSR / static markup tests).
 */

let registered = false;
export function registerScroll() {
  if (registered || typeof window === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export { gsap, ScrollTrigger };

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/** Smooth, inertial scrolling tuned so sections "glide" like a transport bar. */
export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || prefersReducedMotion()) return;
    registerScroll();
    let lenis: Lenis | null = null;
    try {
      lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9, touchMultiplier: 1.1 });
    } catch {
      return;
    }
    const instance = lenis;
    instance.on('scroll', ScrollTrigger.update);
    const raf = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add('lenis-active');
    return () => {
      gsap.ticker.remove(raf);
      instance.destroy();
      document.documentElement.classList.remove('lenis-active');
    };
  }, [enabled]);
}
