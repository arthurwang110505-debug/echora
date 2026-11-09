import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAmllDbRequestPath, fetchAmllDbLyrics, isAmllPlatform, readAmllDbIds, toLyricData } from './amllDb';
import { parseAmllTtml } from '../lyrics/amllTtml';

const REAL_DOCUMENT = '<tt><head><metadata><amll:meta key="ncmMusicId" value="347230"/>'
  + '<amll:meta key="musicName" value="海阔天空"/><amll:meta key="artists" value="Beyond"/></metadata></head>'
  + '<body><div><p begin="00:18.432" end="00:25.089">'
  + '<span begin="00:18.432" end="00:18.818">今</span><span begin="00:18.818" end="00:19.286">天</span>'
  + '<span ttm:role="x-roman">gam tin</span></p></div></body></tt>';

afterEach(() => { vi.unstubAllGlobals(); });

describe('buildAmllDbRequestPath', () => {
  it('builds a same-origin path, not an absolute URL', () => {
    // The client must never name a host: that is the property that makes the route un-forgeable.
    const path = buildAmllDbRequestPath('ncm', 347230);
    expect(path).toBe('/api/lyrics/amll?platform=ncm&id=347230');
    expect(path).not.toContain('http');
  });

  it.each(['ncm', 'qq', 'spotify', 'am'])('accepts the %s platform', platform => {
    expect(buildAmllDbRequestPath(platform, 1)).not.toBeNull();
  });

  it.each(['', 'kuwo', 'NCM', 'http://evil.test', '../ncm'])('rejects the %j platform', platform => {
    expect(buildAmllDbRequestPath(platform, 1)).toBeNull();
  });

  it.each(['../../etc/passwd', '1 OR 1', 'abc', '', '1/2', '-1'])('rejects the %j id', id => {
    expect(buildAmllDbRequestPath('ncm', id)).toBeNull();
  });

  it('accepts a numeric string as well as a number', () => {
    expect(buildAmllDbRequestPath('ncm', '347230')).toBe(buildAmllDbRequestPath('ncm', 347230));
  });
});

describe('isAmllPlatform', () => {
  it('narrows only the four real platforms', () => {
    expect(isAmllPlatform('ncm')).toBe(true);
    expect(isAmllPlatform('kuwo')).toBe(false);
    expect(isAmllPlatform('')).toBe(false);
  });
});

describe('readAmllDbIds', () => {
  it('finds every platform id a song carries', () => {
    // A song can come from somewhere that knows more than one platform; trying each is cheaper
    // than deciding up front which is right.
    const ids = readAmllDbIds({ ncmMusicId: 347230, qqMusicId: '108782' });
    expect(ids).toEqual([
      { platform: 'ncm', musicId: 347230 },
      { platform: 'qq', musicId: '108782' },
    ]);
  });

  it('returns nothing for a song with no platform id', () => {
    // The common case: a YouTube playlist item. No id means no lookup, not a guess from the title.
    expect(readAmllDbIds({ id: 'by4SYYWlhEs', title: '夜に駆ける' })).toEqual([]);
  });

  it('survives a missing or malformed song', () => {
    expect(readAmllDbIds(null)).toEqual([]);
    expect(readAmllDbIds(undefined)).toEqual([]);
    expect(readAmllDbIds('not a song')).toEqual([]);
  });

  it('ignores an id field of the wrong type', () => {
    expect(readAmllDbIds({ ncmMusicId: { nested: true } })).toEqual([]);
  });
});

describe('fetchAmllDbLyrics', () => {
  it('returns word-by-word lyrics for a known song', async () => {
    const fetchImpl = vi.fn(async () => new Response(REAL_DOCUMENT, { status: 200 }));
    const lyrics = await fetchAmllDbLyrics({ platform: 'ncm', musicId: 347230 }, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(lyrics?.isWordByWord).toBe(true);
    expect(lyrics?.origin).toBe('amll-db');
    expect(lyrics?.artist).toBe('Beyond');
    expect(lyrics?.lines[0].words.length).toBeGreaterThan(1);
  });

  it('requests the same-origin route with no credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response(REAL_DOCUMENT, { status: 200 }));
    await fetchAmllDbLyrics({ platform: 'ncm', musicId: 347230 }, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/lyrics/amll?platform=ncm&id=347230');
    expect(init.credentials).toBe('omit');
  });

  it('returns null for a song the database does not have', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));
    expect(await fetchAmllDbLyrics({ platform: 'ncm', musicId: 1 }, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });

  it('returns null rather than throwing on a network failure', async () => {
    // The caller treats this as "this source has nothing" and falls back to LRCLIB; a thrown error
    // would have to be caught at every call site to mean the same thing.
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    expect(await fetchAmllDbLyrics({ platform: 'ncm', musicId: 1 }, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });

  it('returns null for a response that is not TTML', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>maintenance</html>', { status: 200 }));
    expect(await fetchAmllDbLyrics({ platform: 'ncm', musicId: 1 }, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });

  it('never issues a request for an invalid lookup', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchAmllDbLyrics({ platform: 'evil', musicId: 1 }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('toLyricData', () => {
  it('marks the origin so the UI can say where the words came from', () => {
    const parsed = parseAmllTtml(REAL_DOCUMENT)!;
    const lyrics = toLyricData(parsed);
    expect(lyrics.origin).toBe('amll-db');
    expect(lyrics.availability).toBe('available');
    expect(lyrics.isWordByWord).toBe(true);
  });

  it('keeps the title and artist the file declares', () => {
    const lyrics = toLyricData(parseAmllTtml(REAL_DOCUMENT)!);
    expect(lyrics.title).toBe('海阔天空');
    expect(lyrics.artist).toBe('Beyond');
  });
});
