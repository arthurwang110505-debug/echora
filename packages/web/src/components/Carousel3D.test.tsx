import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Carousel3D } from './Carousel3D';

const songs = [
  {
    id: 'local-1',
    title: 'Demo One',
    artists: [{ id: 'artist-1', name: 'Demo Artist' }],
    album: { id: 'album-1', name: 'Demo Album' },
    durationMs: 180000,
    source: 'local' as const,
  },
  {
    id: 'local-2',
    title: 'Demo Two',
    artists: [{ id: 'artist-2', name: 'Another Artist' }],
    album: { id: 'album-2', name: 'Another Album' },
    durationMs: 190000,
    source: 'local' as const,
  },
];

describe('Carousel3D accessibility contract', () => {
  it('exposes a carousel group and an active keyboard selection hint', () => {
    const markup = renderToStaticMarkup(<Carousel3D items={songs} onSelect={vi.fn()} />);

    expect(markup).toContain('aria-label="3D 歌曲輪播"');
    expect(markup).toContain('aria-roledescription="carousel"');
    expect(markup).toContain('id="carousel-selection-hint"');
    expect(markup).toContain('按 Enter 播放');
    expect(markup).toContain('min-h-11 min-w-11');
    expect(markup).toContain('aria-describedby="carousel-selection-hint"');
  });

  it('keeps only the active card in the tab order', () => {
    const markup = renderToStaticMarkup(<Carousel3D items={songs} onSelect={vi.fn()} initialFocusedIndex={1} />);

    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('tabindex="-1"');
  });
});
