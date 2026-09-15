import { useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

/**
 * TiltCard — premium 3D tilt on hover with a cursor-tracked specular
 * spotlight (CSS vars --mx/--my drive a radial-gradient overlay in CSS).
 * Falls back to a static card when the user prefers reduced motion.
 */

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}

export default function TiltCard({ children, className = '', maxTilt = 4.5 }: TiltCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 170, damping: 20, mass: 0.6 });
  const rotateY = useSpring(rawY, { stiffness: 170, damping: 20, mass: 0.6 });

  const handleMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rawY.set((px - 0.5) * 2 * maxTilt);
    rawX.set(-(py - 0.5) * 2 * maxTilt);
    target.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    target.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  }, [maxTilt, prefersReducedMotion, rawX, rawY]);

  const handleLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  return (
    <motion.div
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={prefersReducedMotion ? undefined : { rotateX, rotateY, transformPerspective: 1100, transformStyle: 'preserve-3d' }}
      className={`tilt-card ${className}`}
    >
      {children}
    </motion.div>
  );
}
