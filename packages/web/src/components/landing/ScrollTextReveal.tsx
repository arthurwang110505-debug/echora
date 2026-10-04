import { useMemo, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';

/**
 * ScrollTextReveal — words light up as the block scrolls through the viewport.
 *
 * The progress is bound to scroll position rather than a timer, so scrubbing
 * back up dims the words again instead of replaying an animation. Latin words
 * stay whole while CJK advances character by character, which keeps both
 * languages readable mid-reveal.
 *
 * Renders a <span> (block-level by default) so callers can drop it inside a
 * <p> or a heading without nesting invalid markup.
 */

/** Latin words (with their trailing punctuation) | whitespace runs | any single character. */
const TOKEN_PATTERN = /[A-Za-z0-9][A-Za-z0-9'’.,!?%&$/-]*|\s+|[\s\S]/gu;

interface RevealTokenProps {
  progress: MotionValue<number>;
  start: number;
  end: number;
  children: ReactNode;
}

function RevealToken({ progress, start, end, children }: RevealTokenProps) {
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  const y = useTransform(progress, [start, end], ['0.22em', '0em']);

  return (
    <motion.span className="inline-block whitespace-pre" style={{ opacity, y }}>
      {children}
    </motion.span>
  );
}

/** Scroll range over which the whole block reveals. */
const SCROLL_OFFSET = ['start 0.85', 'end 0.45'] as const;

interface ScrollTextRevealProps {
  text: string;
  className?: string;
  /** Share of the scroll range a single token takes to light up (0..1). */
  stagger?: number;
}

export default function ScrollTextReveal({
  text,
  className = '',
  stagger = 0.55,
}: ScrollTextRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: [...SCROLL_OFFSET] });
  const tokens = useMemo(() => text.match(TOKEN_PATTERN) ?? [text], [text]);
  const animatedCount = useMemo(() => tokens.filter(token => token.trim() !== '').length, [tokens]);

  // Reduced motion: plain text, no scroll binding, no dim state to recover from.
  if (prefersReducedMotion) {
    return <span ref={ref} className={`block ${className}`}>{text}</span>;
  }

  let animatedIndex = 0;

  return (
    <span ref={ref} className={`block ${className}`}>
      {tokens.map((token, position) => {
        if (token.trim() === '') {
          return <span key={position} className="whitespace-pre">{token}</span>;
        }
        const start = (animatedIndex / Math.max(animatedCount, 1)) * (1 - stagger);
        animatedIndex += 1;
        return (
          <RevealToken key={position} progress={scrollYProgress} start={start} end={start + stagger}>
            {token}
          </RevealToken>
        );
      })}
    </span>
  );
}
