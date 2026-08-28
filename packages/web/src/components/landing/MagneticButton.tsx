import { useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

/**
 * MagneticButton — the CTA leans toward the cursor with spring physics
 * (a small, weighty pull — max ~10px), and compresses on tap.
 */

interface MagneticButtonProps {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  strength?: number;
  maxShift?: number;
  ariaLabel?: string;
}

export default function MagneticButton({
  children,
  onClick,
  className = '',
  strength = 0.24,
  maxShift = 10,
  ariaLabel,
}: MagneticButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 240, damping: 18, mass: 0.5 });
  const y = useSpring(rawY, { stiffness: 240, damping: 18, mass: 0.5 });

  const clamp = (value: number) => Math.max(-maxShift, Math.min(maxShift, value));

  const handleMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    rawX.set(clamp((event.clientX - (rect.left + rect.width / 2)) * strength));
    rawY.set(clamp((event.clientY - (rect.top + rect.height / 2)) * strength));
  }, [maxShift, prefersReducedMotion, rawX, rawY, strength]);

  const handleLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      aria-label={ariaLabel}
      style={prefersReducedMotion ? undefined : { x, y }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.955 }}
      className={className}
    >
      {children}
    </motion.button>
  );
}
