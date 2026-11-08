import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLrcLibLyrics, processLrcLibTrack } from './lrclib';

afterEach(() => { vi.unstubAllGlobals(); });

describe('LRCLib lyric availability', () => {
  it('marks instrumental tracks without fabricating a lyric line', () => {
    const result = processLrcLibTrack({
      id: 1,
      name: 'Instrumental',
      artistName: 'Echora',
      duration: 180,
      instrumental: true,
    });

    expect(result).toMatchObject({ availability: 'instrumental', lines: [] });
  });

  it('marks tracks without lyric text as unavailable', () => {
    const result = processLrcLibTrack({
      id: 2,
      name: 'No lyrics',
      artistName: 'Echora',
      duration: 180,
      instrumental: false,
    });

    expect(result).toMatchObject({ availability: 'unavailable', lines: [] });
  });
});

describe('LRCLib search selection', () => {
  const searchResponse = (tracks: Array<Record<string, unknown>>) => new Response(JSON.stringify(tracks));

  it('cleans the query before it reaches the API', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes('/api/get')) return new Response('{}', { status: 404 });
      return searchResponse([]);
    }));

    await fetchLrcLibLyrics({ trackName: '夜に駆ける (Official Video)', artistName: 'YOASOBI - Topic', duration: 261 });

    // The exact-match call must carry the song, not the video's packaging.
    expect(urls[0]).toContain('track_name=%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B');
    expect(urls[0]).toContain('artist_name=YOASOBI');
    expect(urls[0]).not.toContain('Official');
    expect(urls[0]).not.toContain('Topic');
    vi.unstubAllGlobals();
  });

  it('picks the recording that agrees, not the first result', async () => {
    // The live shape of the bug: a cover is listed first and it does have synced lyrics.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/get')) return new Response('{}', { status: 404 });
      return searchResponse([
        { id: 1, name: '夜に駆ける', artistName: 'Piano Cover Channel', duration: 240, syncedLyrics: '[00:00.00] cover' },
        { id: 2, name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: '[00:00.00] real' },
      ]);
    }));

    const result = await fetchLrcLibLyrics({ trackName: '夜に駆ける', artistName: 'YOASOBI', duration: 261 });

    expect(result?.artist).toBe('YOASOBI');
    expect(result?.lines[0]?.fullText).toBe('real');
    vi.unstubAllGlobals();
  });

  it('returns nothing rather than a confident wrong answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/get')) return new Response('{}', { status: 404 });
      return searchResponse([{ id: 1, name: '紅蓮華', artistName: 'LiSA', duration: 240, syncedLyrics: '[00:00.00] other song' }]);
    }));

    expect(await fetchLrcLibLyrics({ trackName: '夜に駆ける', artistName: 'YOASOBI', duration: 261 })).toBeNull();
    vi.unstubAllGlobals();
  });

  it('still returns an exact match without consulting search', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 9, name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: '[00:01.00] line',
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLibLyrics({ trackName: '夜に駆ける', artistName: 'YOASOBI', duration: 261 });

    expect(result?.lines[0]?.fullText).toBe('line');
    // One request: the exact-match endpoint answered, so search is never reached.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('keeps working when the query has no artist', async () => {
    // `/api/get` requires an artist, so this necessarily goes through search.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/get')) return new Response('{}', { status: 404 });
      return searchResponse([{ id: 3, name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: '[00:00.00] ok' }]);
    }));

    const result = await fetchLrcLibLyrics({ trackName: '夜に駆ける', artistName: '' });
    expect(result?.lines[0]?.fullText).toBe('ok');
    vi.unstubAllGlobals();
  });

  it('treats a non-array search response as no results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/get')) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ error: 'rate limited' }));
    }));

    expect(await fetchLrcLibLyrics({ trackName: '夜に駆ける', artistName: 'YOASOBI' })).toBeNull();
    vi.unstubAllGlobals();
  });
});
