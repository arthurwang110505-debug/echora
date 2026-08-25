import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import { ArrowRight, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { type Song } from '@echora/core';
import { CoverImage } from './LoadingSkeletons';

interface CarouselItemProps {
  item: Song;
  distance: number;
  isActive: boolean;
  xOffset: number;
  coverSize: number;
  scale: number;
  opacity: number;
  zIndex: number;
  rotateY: number;
  onSelect: () => void;
  onFocus: () => void;
}

// Folia 3D Carousel item with real-time blur motion and spring physics
const CarouselItem: React.FC<CarouselItemProps> = ({
  item,
  isActive,
  xOffset,
  coverSize,
  scale,
  opacity,
  zIndex,
  rotateY,
  onSelect,
  onFocus,
}) => {
  const blurTarget = isActive ? 0 : 1.5;
  const blurMotion = useMotionValue(blurTarget);
  const blurString = useTransform(blurMotion, (value) => {
    const clamped = Math.max(0, Math.min(10, isNaN(value) || !isFinite(value) ? 0 : value));
    return `blur(${clamped}px)`;
  });

  useEffect(() => {
    const controls = animate(blurMotion, blurTarget, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    });
    return () => controls.stop();
  }, [blurTarget, blurMotion]);

  return (
    <motion.div
      className="absolute cursor-pointer select-none"
      initial={false}
      role="button"
      tabIndex={isActive ? 0 : -1}
      aria-label={`${item.title}，${isActive ? '目前選取，按 Enter 播放' : '按 Enter 選取'}`}
      aria-current={isActive ? 'true' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (isActive) onSelect();
          else onFocus();
        }
      }}
      animate={{
        x: xOffset,
        scale: scale,
        opacity: opacity,
        zIndex: zIndex,
        rotateY: rotateY,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        filter: blurString,
        transformStyle: 'preserve-3d',
      }}
      onClick={() => {
        if (isActive) onSelect();
        else onFocus();
      }}
    >
      <div
        className={`relative overflow-hidden rounded-3xl border border-white/15 shadow-2xl transition-all duration-300 group ${
          isActive ? 'ring-2 ring-[#62f5c4]/60 shadow-[0_20px_50px_rgba(98,245,196,0.25)]' : 'bg-white/[0.03] hover:border-[#62f5c4]/35 hover:ring-1 hover:ring-white/30'
        }`}
        style={{ width: coverSize, height: coverSize }}
      >
        <CoverImage
          src={item.coverUrl}
          alt={item.title}
          wrapperClassName="absolute inset-0"
          className="w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-105"
        />

        <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10 transition-opacity ${isActive ? 'opacity-45' : 'opacity-35 group-hover:opacity-25'}`} />

        <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-black/40 backdrop-blur-md text-white border border-white/10">
          {item.source === 'ytmusic' ? 'YT MUSIC' : item.source === 'local' ? '本機音檔' : 'SPOTIFY'}
        </span>

        {isActive && (
          <span
            className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#62f5c4] text-black shadow-[0_0_25px_rgba(98,245,196,0.6)] transition-all duration-200"
            aria-hidden="true"
          >
            <Play size={20} className="ml-0.5 fill-black" />
          </span>
        )}
      </div>
    </motion.div>
  );
};

export interface Carousel3DProps {
  items: Song[];
  onSelect: (item: Song) => void;
  initialFocusedIndex?: number;
  onFocusedIndexChange?: (index: number) => void;
}

export const Carousel3D: React.FC<Carousel3DProps> = ({
  items,
  onSelect,
  initialFocusedIndex = 0,
  onFocusedIndexChange,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(initialFocusedIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleFocus = useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(items.length - 1, index));
      setFocusedIndex(bounded);
      onFocusedIndexChange?.(bounded);
    },
    [items.length, onFocusedIndexChange]
  );

  const prevCover = useCallback(() => {
    handleFocus(focusedIndex - 1);
  }, [focusedIndex, handleFocus]);

  const nextCover = useCallback(() => {
    handleFocus(focusedIndex + 1);
  }, [focusedIndex, handleFocus]);

  // Keyboard navigation stays inside the carousel instead of hijacking search fields or other controls.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevCover();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextCover();
      }
    };
    const node = containerRef.current;
    node?.addEventListener('keydown', handleKeyDown);
    return () => node?.removeEventListener('keydown', handleKeyDown);
  }, [prevCover, nextCover]);

  // Responsive cover size and spacing
  const isMobile = containerWidth < 640;
  const isTablet = containerWidth >= 640 && containerWidth < 1024;
  const coverSize = isMobile ? 192 : isTablet ? 260 : 310;
  const spacing = isMobile ? 112 : isTablet ? 170 : 210;

  const currentSong = items[focusedIndex];
  const artistName = currentSong
    ? typeof currentSong.artists[0] === 'string'
      ? currentSong.artists[0]
      : currentSong.artists[0]?.name || 'Unknown Artist'
    : '';

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col items-center justify-center py-6 select-none overflow-hidden"
      style={{ perspective: 1100 }}
      role="group"
      aria-label="3D 歌曲輪播"
    >
      {/* Navigation Arrows */}
      <div className="absolute inset-y-0 left-2 right-2 flex items-center justify-between pointer-events-none z-30">
        <button
          type="button"
          onClick={prevCover}
          disabled={focusedIndex === 0}
          className="p-3 rounded-full bg-black/40 border border-white/10 text-white backdrop-blur-xl pointer-events-auto hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-90"
          aria-label="前一張專輯"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          onClick={nextCover}
          disabled={focusedIndex === items.length - 1}
          className="p-3 rounded-full bg-black/40 border border-white/10 text-white backdrop-blur-xl pointer-events-auto hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-90"
          aria-label="後一張專輯"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* 3D Carousel Stage */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '100%',
          height: coverSize + 40,
          transformStyle: 'preserve-3d',
        }}
      >
        {items.map((item, index) => {
          const distance = index - focusedIndex;
          if (Math.abs(distance) > 4) return null; // Render nearby items for performance

          const isActive = distance === 0;
          const xOffset = distance * spacing;
          const rotateY = -Math.sign(distance) * Math.min(55, Math.abs(distance) * 38);
          const scale = Math.max(0.65, 1 - Math.abs(distance) * 0.15);
          const opacity = Math.max(0.24, 1 - Math.abs(distance) * 0.23);
          const zIndex = 50 - Math.abs(distance);

          return (
            <CarouselItem
              key={item.id}
              item={item}
              distance={distance}
              isActive={isActive}
              xOffset={xOffset}
              coverSize={coverSize}
              scale={scale}
              opacity={opacity}
              zIndex={zIndex}
              rotateY={rotateY}
              onSelect={() => onSelect(item)}
              onFocus={() => handleFocus(index)}
            />
          );
        })}
      </div>

      {/* Focused Song Details with AnimatePresence */}
      <AnimatePresence mode="wait">
        {currentSong && (
          <motion.div
            key={currentSong.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="z-20 mt-2 max-w-md px-4 text-center sm:mt-3"
          >
            <h3 className="truncate font-heading text-lg font-extrabold tracking-tight text-white drop-shadow-md sm:text-2xl">
              {currentSong.title}
            </h3>
            <p className="text-xs sm:text-sm text-[#62f5c4] font-medium mt-1 truncate">
              {artistName} {currentSong.album?.name ? `• ${currentSong.album.name}` : ''}
            </p>
            <div className="mt-3 flex items-center justify-center gap-3 sm:mt-4">
              <button
                type="button"
                onClick={() => onSelect(currentSong)}
                className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black text-xs font-black shadow-[0_0_20px_rgba(98,245,196,0.35)] hover:brightness-110 active:scale-95 transition-all"
              >
                立即播放舞台 <ArrowRight aria-hidden="true" className="ml-1.5 inline-block h-3.5 w-3.5 align-[-2px]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
