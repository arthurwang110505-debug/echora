// packages/core/src/lyrics/songTitle.ts
//
// Cleaning a song title before it is used as a lyrics search query.
//
// The problem this exists for is not subtle: a YouTube playlist item is not a song, it is a video.
// Its title carries the video's packaging, and its "artist" is whatever channel uploaded it.
//
//   title:  "YOASOBI「夜に駆ける」(Official Music Video)"
//   artist: "Ayase / YOASOBI"
//
// Searching LRCLIB with that title finds nothing, so the app reports "no lyrics" for a song that
// LRCLIB has had since the day it came out. Every rule below was chosen because a real title in the
// wild needs it, and the tests are that list of titles.
//
// Two rules govern everything here:
//
//   1. **This is only ever applied to a search query, never to a displayed title.** Cleaning is
//      heuristic, so it will sometimes be wrong; wrongness is harmless when it only means a
//      slightly different query, and unacceptable when it means the user's library shows
//      "夜に駆ける" as "夜".
//   2. **Prefer removing too little over removing too much.** A parenthetical stays unless it is
//      recognisable boilerplate; an unrecognised "(2021 Remaster)" costs one missed match, while
//      over-eager stripping mangles genuinely different songs into the same query.

/** Bracketed segments, ASCII and the full-width forms that dominate Japanese and Chinese titles. */
const BRACKET_PATTERNS = [
  /\(([^)]*)\)/g,
  /\[([^\]]*)\]/g,
  /【([^】]*)】/g,
  /「([^」]*)」/g,
  /『([^』]*)』/g,
];

/**
 * Packaging that never belongs in a lyrics query.
 *
 * Matched case-insensitively against the *contents* of a bracketed segment, so `(Official Video)`,
 * `【MV】` and `[Official Music Video]` are one rule. Deliberately not anchored: "Official Video HD"
 * and "MV Full Ver." are the same kind of noise.
 */
const NOISE_IN_BRACKETS = [
  /\bofficial\b/i,
  /\bmv\b/i,
  /\bmusic\s*video\b/i,
  /\bvideo\b/i,
  /\baudio\b/i,
  /\blyric\s*video\b/i,
  /\blyrics?\b/i,
  /\bvisuali[sz]er\b/i,
  /\bperformance\b/i,
  /\blive\b/i,
  /\bremaster(ed)?\b/i,
  /\bhd\b/i,
  /\b4k\b/i,
  /\b8d\b/i,
  /\bhi-?res\b/i,
  /\bcolor\s*coded\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\bcover\b/i,
  /\bshort\s*ver(sion)?\.?\b/i,
  /\bfull\s*ver(sion)?\.?\b/i,
  /^\s*(mv|pv|tv\s*size|short|full)\s*$/i,
  /^\s*[「『【]?\s*(official|mv|pv)\s*[」』】]?\s*$/i,
];

/**
 * Packaging that survives outside brackets, because it is not bracketed in the wild.
 *
 * `- Topic` is the auto-generated YouTube channel suffix; `feat.` introduces a performer who is not
 * the artist of record, and keeping it makes the query a miss on the original track.
 */
const NOISE_INLINE = [
  /\s*[-–—]\s*topic\s*$/i,
  /\s*[-–—]\s*official\s*(music\s*)?(video|audio)\s*$/i,
  /\s+feat\.?\s+.*$/i,
  /\s+ft\.?\s+.*$/i,
  /\s+featuring\s+.*$/i,
  // Version markers that were unbracketed, or that survived a bracket being removed. These name a
  // *different recording* of the song, which is exactly what makes them a missed match when they
  // stay in the query.
  /\s*[-–—]?\s*\benglish\s*(ver|version)\b\.?\s*$/i,
  /\s*[-–—]?\s*\bjapanese\s*(ver|version)\b\.?\s*$/i,
  /\s*[-–—]?\s*\bacoustic\s*(ver|version)?\b\.?\s*$/i,
  /\s*[-–—]?\s*\b(tv|short|full)\s*(size|ver|version)\b\.?\s*$/i,
];

/**
 * Decorative quotes around a whole title.
 *
 * Applied only when the string is *entirely* wrapped, and only as a matched pair. A per-end strip
 * turns `YOASOBI「夜に駆ける」` into `YOASOBI「夜に駆ける` - unpaired, and no longer recognisable as
 * the artist-plus-title form that `splitArtistAndTitle` handles next.
 */
const WRAPPING_QUOTE_PAIRS: Array<[string, string]> = [
  ['"', '"'], ["'", "'"], ['`', '`'], ['「', '」'], ['『', '』'], ['“', '”'], ['【', '】'],
];

/** Collapses runs of whitespace and trims, so a removed segment does not leave a double space. */
const tidy = (value: string) => value.replace(/\s{2,}/g, ' ').replace(/\s*([,、])\s*/g, '$1 ').trim();

/** True when a bracketed segment is packaging rather than part of the title. */
export const isNoiseSegment = (segment: string): boolean => {
  const value = segment.trim();
  if (!value) return true;
  return NOISE_IN_BRACKETS.some(pattern => pattern.test(value));
};

/** Removes one matched pair of decorative quotes, repeated while a pair remains. */
const wrapStrip = (input: string): string => {
  let value = input.trim();
  for (let guard = 0; guard < 4; guard += 1) {
    const pair = WRAPPING_QUOTE_PAIRS.find(([open, close]) => (
      value.length > 1 && value.startsWith(open) && value.endsWith(close)
    ));
    if (!pair) return value;
    value = value.slice(pair[0].length, value.length - pair[1].length).trim();
  }
  return value;
};

/**
 * Removes packaging from a title.
 *
 * Bracketed noise is dropped whole; everything else is kept, because a bracket can also be the
 * title ("(What's the Story) Morning Glory?"). Only segments matching a known pattern go.
 */
export const cleanSongTitle = (raw: string): string => {
  if (!raw) return '';

  let value = raw;

  // Bracketed segments first: removing them can expose an inline suffix that was hiding behind one.
  for (const pattern of BRACKET_PATTERNS) {
    value = value.replace(pattern, (match, inner: string) => (isNoiseSegment(inner) ? ' ' : match));
  }

  for (const pattern of NOISE_INLINE) {
    value = value.replace(pattern, '');
  }

  value = wrapStrip(value);
  value = tidy(value);

  return value;
};

/**
 * Splits a combined "Artist - Title" string into its parts.
 *
 * YouTube titles are frequently `Artist - Song`, and the channel name is frequently just the artist
 * or a label. When the separator is absent the string is returned as the title with no artist,
 * because guessing is worse than searching on the title alone.
 *
 * Only the first separator is used: a title may legitimately contain a dash afterwards
 * ("King Gnu - 白日 - Live" is already handled by `cleanSongTitle`).
 */
export const splitArtistAndTitle = (raw: string): { artist?: string; title: string } => {
  const value = raw.trim();
  if (!value) return { title: '' };

  // Japanese and Chinese uploads very often use `Channel「Song」` with no dash at all.
  const quoted = value.match(/^(.{1,80}?)\s*[「『【](.+)[」』】]$/);
  if (quoted) {
    const artist = tidy(quoted[1]);
    const title = tidy(quoted[2]);
    if (artist && title) return { artist, title };
  }

  // Require spaces around the dash: "Jay-Z" and "re-zero" are single words, "A - B" is two fields.
  const match = value.match(/^(.{1,80}?)\s+[-–—]\s+(.+)$/);
  if (!match) return { title: value };

  const artist = tidy(match[1]);
  const title = tidy(match[2]);
  if (!artist || !title) return { title: value };
  return { artist, title };
};

/** The fields a search query is built from. Mirrors the subset of `Song` this needs. */
export interface LyricSearchInput {
  title: string;
  artist?: string;
  durationMs?: number;
}

export interface LyricSearchQuery {
  /** What to send as the track name. */
  title: string;
  /** What to send as the artist, when one could be determined. */
  artist?: string;
  /** What to prefer when scoring results. */
  durationMs?: number;
}

/**
 * Builds the query for one song.
 *
 * The order matters: split first (so a title and an artist can be distinguished), then clean each
 * part independently, then fall back to the uncleaned value if cleaning emptied a field. A query of
 * `""` is worse than a query of `"【】"`, because the first returns nothing for certain.
 */
export const buildLyricSearchQuery = (input: LyricSearchInput): LyricSearchQuery => {
  const rawTitle = (input.title || '').trim();
  const rawArtist = (input.artist || '').trim();

  // Order matters, and getting it wrong is invisible: `YOASOBI「夜に駆ける」(Official Music Video)`
  // only matches the quoted `Channel「Song」` form once the trailing segment is gone, and cleaning
  // cannot remove it while the string still ends in `」`. So the packaging is cleared first, the
  // split happens on the cleaner string, and each part is cleaned again afterwards.
  const outerCleaned = cleanSongTitle(rawTitle);
  const split = splitArtistAndTitle(outerCleaned.length >= 2 ? outerCleaned : rawTitle);
  let title = cleanSongTitle(split.title);
  // The channel name is only useful as an artist when the title did not already provide one.
  let artist: string | undefined = split.artist ? cleanSongTitle(split.artist) : cleanSongTitle(rawArtist);

  if (!title) title = rawTitle || rawArtist;
  if (!artist) artist = undefined;
  // A channel name that merely repeats the title adds nothing and can confuse a matcher.
  if (artist && title && artist.toLowerCase() === title.toLowerCase()) artist = undefined;

  return { title, artist, durationMs: input.durationMs };
};
