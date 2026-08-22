import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

interface SkeletonBlockProps {
  className?: string;
  style?: CSSProperties;
}

function SkeletonBlock({ className = '', style }: SkeletonBlockProps) {
  return <span aria-hidden="true" className={`echora-skeleton-block ${className}`} style={style} />;
}

interface CoverImageProps {
  src?: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  loading?: 'lazy' | 'eager';
}

export function CoverImage({ src, alt, className = '', wrapperClassName = '', loading = 'eager' }: CoverImageProps) {
  const [isLoading, setIsLoading] = useState(Boolean(src));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoading(Boolean(src));
    setHasError(false);
  }, [src]);

  return (
    <span className={`relative block overflow-hidden ${wrapperClassName}`} aria-busy={isLoading || undefined}>
      {(isLoading || hasError || !src) && (
        <span className="absolute inset-0 z-0" aria-hidden="true">
          <span className="echora-cover-skeleton-mark">{hasError || !src ? <Sparkles aria-hidden="true" className="h-5 w-5" /> : null}</span>
        </span>
      )}
      {src && !hasError && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setIsLoading(false)}
          onError={() => { setHasError(true); setIsLoading(false); }}
          className={`relative z-10 transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'} ${className}`}
        />
      )}
    </span>
  );
}

function SkeletonArtwork({ className = '' }: SkeletonBlockProps) {
  return (
    <div aria-hidden="true" className={`echora-skeleton-block echora-skeleton-artwork ${className}`}>
      <span className="echora-skeleton-artwork-ring" />
      <span className="echora-skeleton-artwork-core" />
    </div>
  );
}

function SkeletonStatus({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function RouteSkeleton() {
  return (
    <div className="echora-route-skeleton" role="status" aria-busy="true" aria-live="polite">
      <div className="echora-route-skeleton-orbit" aria-hidden="true" />
      <div className="echora-route-skeleton-mark" aria-hidden="true">E</div>
      <SkeletonBlock className="echora-route-skeleton-kicker" />
      <SkeletonBlock className="echora-route-skeleton-title" />
      <SkeletonBlock className="echora-route-skeleton-copy" />
      <SkeletonStatus>正在載入 Echora 舞台內容…</SkeletonStatus>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="echora-page-skeleton" role="status" aria-busy="true" aria-live="polite">
      <div className="echora-skeleton-page-glow echora-skeleton-page-glow-left" aria-hidden="true" />
      <div className="echora-skeleton-page-glow echora-skeleton-page-glow-right" aria-hidden="true" />
      <header className="echora-skeleton-header">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="echora-skeleton-brand-mark" />
          <div className="space-y-1.5">
            <SkeletonBlock className="h-3.5 w-24" />
            <SkeletonBlock className="h-2 w-32 opacity-60" />
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <SkeletonBlock className="h-8 w-20 rounded-xl" />
          <SkeletonBlock className="h-8 w-20 rounded-xl" />
          <SkeletonBlock className="h-9 w-9 rounded-xl" />
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-[1440px] space-y-10 px-5 pb-28 pt-7 sm:px-8 lg:px-12 lg:pt-12">
        <section className="echora-skeleton-hero">
          <div className="max-w-2xl">
            <SkeletonBlock className="h-7 w-40 rounded-full" />
            <SkeletonBlock className="mt-6 h-14 w-[min(32rem,90%)] rounded-2xl sm:h-20" />
            <SkeletonBlock className="mt-3 h-14 w-[min(25rem,75%)] rounded-2xl sm:h-20" />
            <SkeletonBlock className="mt-6 h-4 w-[min(34rem,90%)] rounded-full" />
            <SkeletonBlock className="mt-2 h-4 w-[min(27rem,72%)] rounded-full opacity-70" />
            <div className="mt-8 flex gap-3">
              <SkeletonBlock className="h-12 w-36 rounded-xl" />
              <SkeletonBlock className="h-12 w-32 rounded-xl opacity-70" />
            </div>
          </div>
          <SkeletonArtwork className="echora-skeleton-hero-art" />
        </section>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map(item => <SkeletonBlock key={item} className="h-20 rounded-2xl" />)}
        </div>
        <section className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <SkeletonBlock className="h-2.5 w-28 rounded-full" />
              <SkeletonBlock className="h-9 w-64 rounded-xl" />
            </div>
            <div className="flex flex-wrap gap-3">
              <SkeletonBlock className="h-11 w-40 rounded-2xl" />
              <SkeletonBlock className="h-11 w-32 rounded-2xl" />
              <SkeletonBlock className="h-11 w-56 rounded-2xl" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-4 w-44 rounded-full" />
            <SkeletonBlock className="h-3 w-20 rounded-full opacity-70" />
          </div>
          <CarouselSkeleton />
        </section>
      </main>
      <SkeletonStatus>正在準備 Echora 首頁與 3D 音樂輪播…</SkeletonStatus>
    </div>
  );
}

export function CarouselSkeleton() {
  return (
    <div className="echora-carousel-skeleton" aria-hidden="true">
      <SkeletonArtwork className="echora-carousel-skeleton-side echora-carousel-skeleton-side-left" />
      <SkeletonArtwork className="echora-carousel-skeleton-center" />
      <SkeletonArtwork className="echora-carousel-skeleton-side echora-carousel-skeleton-side-right" />
      <div className="echora-carousel-skeleton-details">
        <SkeletonBlock className="h-6 w-44 rounded-lg" />
        <SkeletonBlock className="mt-2 h-3 w-28 rounded-full opacity-70" />
        <SkeletonBlock className="mx-auto mt-5 h-10 w-32 rounded-2xl" />
      </div>
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div className="echora-player-skeleton" role="status" aria-busy="true" aria-live="polite">
      <header className="echora-skeleton-player-header">
        <SkeletonBlock className="h-10 w-10 rounded-2xl" />
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-2xl" />
          <SkeletonBlock className="h-8 w-9 rounded-2xl" />
        </div>
      </header>
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <aside className="echora-skeleton-queue">
          <SkeletonBlock className="h-10 w-full rounded-2xl" />
          <SkeletonBlock className="h-10 w-full rounded-xl opacity-70" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map(item => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBlock className="h-3 w-4/5 rounded-full" />
                  <SkeletonBlock className="h-2.5 w-1/2 rounded-full opacity-60" />
                </div>
              </div>
            ))}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden p-4 sm:p-6 md:p-8">
          <div className="flex w-fit items-center gap-4 rounded-3xl border border-white/[0.07] bg-white/[0.035] p-4">
            <SkeletonBlock className="h-16 w-16 rounded-2xl" />
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-48 rounded-lg" />
              <SkeletonBlock className="h-3 w-32 rounded-full opacity-70" />
            </div>
          </div>
          <StageSkeleton />
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5">
            <SkeletonBlock className="h-2.5 w-full rounded-full" />
            <div className="mt-5 flex items-center justify-center gap-6">
              <SkeletonBlock className="h-9 w-9 rounded-full" />
              <SkeletonBlock className="h-14 w-14 rounded-full" />
              <SkeletonBlock className="h-9 w-9 rounded-full" />
            </div>
          </div>
        </main>
      </div>
      <SkeletonStatus>正在恢復播放佇列與 Echora 舞台…</SkeletonStatus>
    </div>
  );
}

export function StageSkeleton() {
  return (
    <div className="echora-stage-skeleton" aria-hidden="true">
      <div className="echora-stage-skeleton-wash" />
      <div className="echora-stage-skeleton-orbit echora-stage-skeleton-orbit-outer" />
      <div className="echora-stage-skeleton-orbit echora-stage-skeleton-orbit-inner" />
      <SkeletonArtwork className="echora-stage-skeleton-art" />
      <div className="echora-stage-skeleton-copy">
        <SkeletonBlock className="h-2.5 w-36 rounded-full" />
        <SkeletonBlock className="mt-4 h-9 w-56 rounded-xl" />
        <SkeletonBlock className="mx-auto mt-3 h-3 w-28 rounded-full opacity-70" />
        <div className="mt-8 flex items-end justify-center gap-1.5">
          {[18, 28, 42, 24, 36, 52, 30, 44, 22, 34, 46].map((height, index) => <SkeletonBlock key={index} className="w-1.5 rounded-full" style={{ height }} />)}
        </div>
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return <div className="echora-panel-skeleton" role="status" aria-busy="true">正在載入舞台設定…</div>;
}
