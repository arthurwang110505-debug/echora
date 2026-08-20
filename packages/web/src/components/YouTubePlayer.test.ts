import { describe, expect, it } from 'vitest';
import { getYouTubeSurfaceClass } from './YouTubePlayer';

describe('getYouTubeSurfaceClass', () => {
  it('keeps the immersive player above the mobile safe area and desktop control bar', () => {
    const className = getYouTubeSurfaceClass(true);

    expect(className).toContain('bottom-[max(6rem,env(safe-area-inset-bottom))]');
    expect(className).toContain('md:bottom-20');
    expect(className).toContain('z-[60]');
  });

  it('keeps the standard player anchored in the non-immersive layout', () => {
    const className = getYouTubeSurfaceClass(false);

    expect(className).toContain('bottom-5');
    expect(className).toContain('right-5');
    expect(className).not.toContain('md:bottom-20');
  });
});
