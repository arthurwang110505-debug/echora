import { describe, expect, it } from 'vitest';
import { buildLyricSearchQuery, cleanSongTitle, isNoiseSegment, splitArtistAndTitle } from './songTitle';

/**
 * Every case here is a shape that actually appears in a YouTube playlist, because that is the input:
 * a playlist item is a video, and a video title is packaging around a song title.
 */
describe('cleanSongTitle', () => {
  it.each([
    // The canonical failure: a Japanese title with a quoted title and a video suffix. `cleanSongTitle`
    // only removes the packaging - separating the channel from the song is the splitter's job, and
    // the next test asserts that end of the pipeline.
    ['YOASOBI「夜に駆ける」(Official Music Video)', 'YOASOBI「夜に駆ける」'],
    ['YOASOBI - 夜に駆ける (Official Video)', 'YOASOBI - 夜に駆ける'],
    ['夜に駆ける [MV]', '夜に駆ける'],
    ['夜に駆ける【MV】', '夜に駆ける'],
    ['夜に駆ける (Music Video)', '夜に駆ける'],
    ['夜に駆ける (Official Audio)', '夜に駆ける'],
    ['夜に駆ける (Lyric Video)', '夜に駆ける'],
    ['夜に駆ける - Topic', '夜に駆ける'],
    ['夜に駆ける [4K]', '夜に駆ける'],
    ['夜に駆ける (Official Video) [4K]', '夜に駆ける'],
    ['夜に駆ける feat. 幾田りら', '夜に駆ける'],
    ['夜に駆ける ft. 幾田りら', '夜に駆ける'],
    ['夜に駆ける (TV Size)', '夜に駆ける'],
    ['夜に駆ける (Short Ver.)', '夜に駆ける'],
    ['夜に駆ける (Remastered 2021)', '夜に駆ける'],
    ['夜に駆ける (Instrumental)', '夜に駆ける'],
    ['夜に駆ける (Karaoke)', '夜に駆ける'],
    ['夜に駆ける (Color Coded Lyrics カナ/ローマ字)', '夜に駆ける'],
    ['夜に駆ける - Official Music Video', '夜に駆ける'],
    ['【MV】夜に駆ける', '夜に駆ける'],
  ])('strips packaging from %s', (input, expected) => {
    expect(cleanSongTitle(input)).toBe(expected);
  });

  it.each([
    // A bracket can be the title. Removing these would rename the song.
    ["(What's the Story) Morning Glory?", "(What's the Story) Morning Glory?"],
    ['(I Can\'t Get No) Satisfaction', '(I Can\'t Get No) Satisfaction'],
    ['夜に駆ける', '夜に駆ける'],
    ['アイドル', 'アイドル'],
    // Not recognised as packaging, so kept: one missed match beats mangling a distinct title.
    ['夜に駆ける (2021 Version)', '夜に駆ける (2021 Version)'],
    ['Bling-Bang-Bang-Born', 'Bling-Bang-Bang-Born'],
  ])('leaves %s intact', (input, expected) => {
    expect(cleanSongTitle(input)).toBe(expected);
  });

  it('handles empty and whitespace-only input', () => {
    expect(cleanSongTitle('')).toBe('');
    expect(cleanSongTitle('   ')).toBe('');
    expect(cleanSongTitle('()')).toBe('');
  });

  it('never leaves a double space behind a removed segment', () => {
    expect(cleanSongTitle('Song  (Official Video)  ')).toBe('Song');
    expect(cleanSongTitle('Song [MV] Title')).toBe('Song Title');
  });
});

describe('isNoiseSegment', () => {
  it.each(['MV', 'Official Video', 'official', '4K', 'TV Size', 'Remastered', 'Lyrics', ''])(
    'treats %j as packaging',
    segment => expect(isNoiseSegment(segment)).toBe(true),
  );

  it.each(['What\'s the Story', '2021 Version', 'English Ver'])(
    'treats %j as title content',
    segment => expect(isNoiseSegment(segment)).toBe(false),
  );
});

describe('splitArtistAndTitle', () => {
  it('splits on a spaced dash', () => {
    expect(splitArtistAndTitle('YOASOBI - 夜に駆ける')).toEqual({ artist: 'YOASOBI', title: '夜に駆ける' });
    expect(splitArtistAndTitle('King Gnu – 白日')).toEqual({ artist: 'King Gnu', title: '白日' });
  });

  it('uses only the first separator', () => {
    expect(splitArtistAndTitle('A - B - C')).toEqual({ artist: 'A', title: 'B - C' });
  });

  it('does not split an unspaced hyphen inside a word', () => {
    // "Jay-Z" and "re-zero" are single words; treating them as "artist - title" would be a guess.
    expect(splitArtistAndTitle('Jay-Z')).toEqual({ title: 'Jay-Z' });
    expect(splitArtistAndTitle('re-zero')).toEqual({ title: 're-zero' });
  });

  it('returns the whole string as the title when there is no separator', () => {
    expect(splitArtistAndTitle('夜に駆ける')).toEqual({ title: '夜に駆ける' });
    expect(splitArtistAndTitle('')).toEqual({ title: '' });
  });
});

describe('buildLyricSearchQuery', () => {
  it('recovers artist and title from a combined YouTube title', () => {
    expect(buildLyricSearchQuery({ title: 'YOASOBI - 夜に駆ける (Official Video)' })).toEqual({
      title: '夜に駆ける',
      artist: 'YOASOBI',
      durationMs: undefined,
    });
  });

  it('splits the quoted Channel「Song」 form after removing its packaging', () => {
    // Ordering bug this guards: the quoted form only matches once the trailing `(Official Music
    // Video)` is gone, and cleaning cannot remove that while the string still ends in `」`.
    expect(buildLyricSearchQuery({ title: 'YOASOBI「夜に駆ける」(Official Music Video)' })).toEqual({
      title: '夜に駆ける',
      artist: 'YOASOBI',
      durationMs: undefined,
    });
  });

  it('falls back to the channel name when the title has no artist', () => {
    expect(buildLyricSearchQuery({ title: '夜に駆ける (Official Video)', artist: 'Ayase' })).toEqual({
      title: '夜に駆ける',
      artist: 'Ayase',
      durationMs: undefined,
    });
  });

  it('cleans a channel name that carries its own packaging', () => {
    expect(buildLyricSearchQuery({ title: '夜に駆ける', artist: 'YOASOBI - Topic' })).toMatchObject({
      title: '夜に駆ける',
      artist: 'YOASOBI',
    });
  });

  it('drops an artist that only repeats the title', () => {
    expect(buildLyricSearchQuery({ title: '夜に駆ける', artist: '夜に駆ける' })).toEqual({
      title: '夜に駆ける',
      artist: undefined,
      durationMs: undefined,
    });
  });

  it('passes duration through for scoring', () => {
    expect(buildLyricSearchQuery({ title: 'Song', durationMs: 225000 }).durationMs).toBe(225000);
  });

  it('never returns an empty title, because an empty query matches nothing at all', () => {
    // Cleaning removed everything, so the raw value is the only usable query left.
    const result = buildLyricSearchQuery({ title: '(Official Video)', artist: 'Someone' });
    expect(result.title).toBe('(Official Video)');
    expect(result.artist).toBe('Someone');
  });

  it('keeps a title whose brackets are part of it', () => {
    expect(buildLyricSearchQuery({ title: "(What's the Story) Morning Glory?", artist: 'Oasis' })).toMatchObject({
      title: "(What's the Story) Morning Glory?",
      artist: 'Oasis',
    });
  });
});
