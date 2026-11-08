// packages/core/src/providers/amllDb.ts
//
// Word-by-word lyrics from the AMLL TTML database (L3-a).
//
// What this is, and what it deliberately is not:
//
// AMLL TTML DB is a curated, community-maintained collection of word-timed lyrics, released under
// **CC0-1.0** - the author placed it in the public domain specifically so downstream players can use
// it. That licence is the whole reason this source was chosen over the alternatives, and it is why
// the request below goes to one known host rather than through a general-purpose proxy: a proxy that
// accepts an arbitrary URL is an SSRF surface, and one that forwards arbitrary third-party lyrics is
// a different legal question entirely. This module can ask exactly one question - "do you have
// lyrics for this platform id" - and nothing else.
//
// Identity is the hard part, not transport. The database is keyed by *platform ids* (NetEase, QQ,
// Spotify, Apple Music), and a YouTube playlist gives you none of them. So the lookup order is:
//
//   1. An id the caller already has (a song that came from a platform-aware source).
//   2. A metadata search, if a matcher provides one (see `resolveAmllDbId`).
//   3. Otherwise, no answer. Guessing an id from a title would return another song's lyrics, which
//      is the failure mode `matchScore.ts` exists to prevent.

import { parseAmllTtml, type ParsedAmllTtml } from '../lyrics/amllTtml';
import type { LyricData } from '../types';

/** Platforms the database is organised by. */
export const AMLL_PLATFORMS = ['ncm', 'qq', 'spotify', 'am'] as const;
export type AmllPlatform = (typeof AMLL_PLATFORMS)[number];

/**
 * The one endpoint this app talks to.
 *
 * Same-origin and purpose-built: it takes a platform and an id, validates both, and builds the
 * upstream URL itself. It is **not** `/api/lyric-proxy?url=…` - that shape lets a caller name any
 * host, and no amount of validation inside a route like that makes it safe to ship.
 */
const AMLL_DB_PROXY_PATH = '/api/lyrics/amll';

const AMLL_DB_TIMEOUT_MS = 8_000;

export const isAmllPlatform = (value: string): value is AmllPlatform => (
  (AMLL_PLATFORMS as readonly string[]).includes(value)
);

/**
 * Builds the same-origin request path.
 *
 * Exported so the rule can be tested without a network: a non-platform or a malformed id must be
 * rejected here, before a URL exists at all.
 */
export const buildAmllDbRequestPath = (platform: string, musicId: string | number): string | null => {
  if (!isAmllPlatform(platform)) return null;
  const id = String(musicId).trim();
  // Platform ids are digits everywhere the database uses them. Restricting the charset is what
  // keeps `../` and absolute URLs out of the path the proxy receives.
  if (!/^\d{1,20}$/.test(id)) return null;
  return `${AMLL_DB_PROXY_PATH}?platform=${platform}&id=${id}`;
};

export interface AmllDbLookup {
  platform: string;
  musicId: string | number;
}

/**
 * Platform ids an `Song` can carry.
 *
 * Read from a loosely-typed extension bag rather than adding four optional fields to `Song`: the
 * database is keyed by whichever platform a track came from, and a song from YouTube has none.
 * Returning every id present lets the caller try the most likely one first.
 */
export const readAmllDbIds = (song: unknown): AmllDbLookup[] => {
  if (!song || typeof song !== 'object') return [];
  const record = song as Record<string, unknown>;
  const lookups: AmllDbLookup[] = [];

  // NetEase first: it is the database's primary source and its ids are the most frequently added.
  const candidates: Array<[string, string]> = [
    ['ncm', 'ncmMusicId'],
    ['ncm', 'neteaseId'],
    ['qq', 'qqMusicId'],
    ['spotify', 'spotifyId'],
    ['am', 'appleMusicId'],
  ];

  for (const [platform, key] of candidates) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') lookups.push({ platform, musicId: value });
  }
  return lookups;
};

export interface AmllDbLyricsOptions {
  /** Overridable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Fetches and parses one document.
 *
 * Returns `null` for every failure - a 404, a timeout, a malformed document - because the caller
 * treats this as "this source has nothing", and a thrown error would have to be caught at every call
 * site to mean the same thing. Genuinely exceptional conditions (a bug) still throw.
 */
export const fetchAmllDbLyrics = async (
  lookup: AmllDbLookup,
  options: AmllDbLyricsOptions = {},
): Promise<LyricData | null> => {
  const path = buildAmllDbRequestPath(lookup.platform, lookup.musicId);
  if (!path) return null;

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AMLL_DB_TIMEOUT_MS);

  try {
    const response = await doFetch(path, {
      // No credentials: this is a public read, and sending cookies to a route that then calls a
      // third party would make the request's provenance ambiguous.
      credentials: 'omit',
      signal: options.signal ?? controller.signal,
    });
    if (!response.ok) return null;

    const text = await response.text();
    const parsed = parseAmllTtml(text);
    if (!parsed) return null;

    return toLyricData(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Converts a parsed document into the shape the player consumes. */
export const toLyricData = (parsed: ParsedAmllTtml): LyricData => ({
  lines: parsed.lines,
  title: parsed.metadata.title,
  artist: parsed.metadata.artist,
  // The distinction the visualizers branch on: word-by-word drives the karaoke highlight, and a
  // single-word line renders as a plain line.
  isWordByWord: parsed.isWordByWord,
  availability: parsed.lines.length ? 'available' : 'unavailable',
  origin: 'amll-db',
});
