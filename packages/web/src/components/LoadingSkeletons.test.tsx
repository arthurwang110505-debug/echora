import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CarouselSkeleton, CoverImage, HomeSkeleton, PlayerSkeleton, RouteSkeleton, StageSkeleton } from './LoadingSkeletons';

describe('LoadingSkeletons', () => {
  it('renders a branded route skeleton with an accessible loading status', () => {
    const markup = renderToStaticMarkup(<RouteSkeleton />);

    expect(markup).toContain('echora-route-skeleton');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('正在載入 Echora 舞台內容');
  });

  it('preserves the home and carousel layout while the 3D chunk loads', () => {
    const homeMarkup = renderToStaticMarkup(<HomeSkeleton />);
    const carouselMarkup = renderToStaticMarkup(<CarouselSkeleton />);

    expect(homeMarkup).toContain('echora-skeleton-hero');
    expect(homeMarkup).toContain('echora-carousel-skeleton');
    expect(carouselMarkup).toContain('echora-carousel-skeleton-center');
    expect(carouselMarkup).toContain('echora-skeleton-artwork-ring');
  });

  it('keeps a same-size branded cover placeholder while artwork is loading', () => {
    const markup = renderToStaticMarkup(
      <CoverImage src="/covers/demo.webp" alt="Demo cover" wrapperClassName="h-16 w-16 rounded-2xl" />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('echora-cover-skeleton-mark');
    expect(markup).toContain('opacity-0');
    expect(markup).toContain('Demo cover');
  });

  it('preserves the player stage composition while data and artwork are loading', () => {
    const playerMarkup = renderToStaticMarkup(<PlayerSkeleton />);
    const stageMarkup = renderToStaticMarkup(<StageSkeleton />);

    expect(playerMarkup).toContain('echora-player-skeleton');
    expect(playerMarkup).toContain('echora-skeleton-queue');
    expect(playerMarkup).toContain('echora-stage-skeleton');
    expect(stageMarkup).toContain('echora-stage-skeleton-orbit-outer');
    expect(stageMarkup).toContain('echora-stage-skeleton-art');
  });
});
