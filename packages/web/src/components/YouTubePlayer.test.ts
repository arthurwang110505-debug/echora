import { describe, expect, it } from 'vitest';
import { getYouTubeSurfaceClass, getYouTubeVideoSurfaceClass } from './YouTubePlayer';

describe('getYouTubeSurfaceClass', () => {
  it('keeps the immersive player above the mobile safe area and desktop control bar', () => {
    const className = getYouTubeSurfaceClass(true);

    expect(className).toContain('bottom-[max(6rem,env(safe-area-inset-bottom))]');
    expect(className).toContain('md:bottom-20');
    expect(className).toContain('z-[60]');
  });

  it('keeps the standard player anchored in the non-immersive layout', () => {
    const className = getYouTubeSurfaceClass(false);

    expect(className).toContain('bottom-[max(7rem,calc(env(safe-area-inset-bottom)+6rem))]');
    expect(className).toContain('sm:bottom-5');
    expect(className).toContain('right-3');
    expect(className).not.toContain('md:bottom-20');
  });

  it('provides an in-flow responsive surface for ordinary YouTube videos', () => {
    const className = getYouTubeVideoSurfaceClass();

    expect(className).toContain('relative');
    expect(className).toContain('aspect-video');
    expect(className).toContain('max-w-5xl');
  });
});
