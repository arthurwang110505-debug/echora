// LRCLib Provider - Zero-config free lyrics API (https://lrclib.net)
import type { LyricData, Line } from '../types';
import { parseLRC } from '../lyrics/parser';
import { buildLyricSearchQuery } from '../lyrics/songTitle';
import { pickBestCandidate, type LyricCandidate } from '../lyrics/matchScore';

export interface LrcLibTrack {
  id: number;
  name: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

const LRCLIB_TIMEOUT_MS = 8000;

const fetchLrcLib = async (url: string, attempt = 0): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LRCLIB_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429 && attempt < 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
      return fetchLrcLib(url, attempt + 1);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Fetches lyrics for one song.
 *
 * Two changes from the previous version, both about the same failure: returning the *wrong* lyrics
 * confidently. The query is cleaned first (`buildLyricSearchQuery` strips video packaging that
 * guaranteed a miss), and the search results are scored rather than taken in order
 * (`pickBestCandidate` prefers the recording whose duration and title agree).
 *
 * `duration` is in seconds, matching the API. Not every caller has one; without it, scoring falls
 * back to title and artist, which is weaker but still better than position in a list.
 */
export async function fetchLrcLibLyrics(params: {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
}): Promise<LyricData | null> {
  try {
    const cleaned = buildLyricSearchQuery({
      title: params.trackName,
      artist: params.artistName,
      durationMs: params.duration ? params.duration * 1000 : undefined,
    });

    const query = new URLSearchParams();
    query.set('track_name', cleaned.title);
    // The exact-match endpoint requires an artist; omitting it would 400 rather than search.
    query.set('artist_name', cleaned.artist || params.artistName || '');
    if (params.albumName) query.set('album_name', params.albumName);
    if (params.duration) query.set('duration', Math.round(params.duration).toString());

    const res = await fetchLrcLib(`https://lrclib.net/api/get?${query.toString()}`);
    if (res.ok) {
      const data: LrcLibTrack = await res.json();
      return processLrcLibTrack(data);
    }

    // `/api/get` is an exact-match endpoint: it answers 404 whenever any of the four fields differs,
    // which for a YouTube-derived title is most of the time. Search, then choose deliberately.
    const searchQuery = new URLSearchParams({
      q: [cleaned.title, cleaned.artist].filter(Boolean).join(' ').trim(),
    });
    const searchRes = await fetchLrcLib(`https://lrclib.net/api/search?${searchQuery.toString()}`);
    if (!searchRes.ok) return null;

    const searchResults: LrcLibTrack[] = await searchRes.json();
    if (!Array.isArray(searchResults) || searchResults.length === 0) return null;

    const best = pickBestCandidate(searchResults as LyricCandidate[], {
      title: cleaned.title,
      artist: cleaned.artist,
      duration: params.duration,
    });

    if (!best) {
      // No confident match. Reporting `unavailable` is honest; the old fallback here showed the
      // first result's lyrics, which for a common title is routinely a different song.
      console.warn('[LrcLib] No confident lyric match', { candidates: searchResults.length });
      return null;
    }

    return processLrcLibTrack(best.candidate as LrcLibTrack);
  } catch (error) {
    console.warn('[LrcLib] Failed to fetch lyrics:', error);
    return null;
  }
}

export function processLrcLibTrack(track: LrcLibTrack): LyricData | null {
  if (track.instrumental) {
    return {
      lines: [],
      title: track.name,
      artist: track.artistName,
      availability: 'instrumental',
    };
  }

  const rawLrc = track.syncedLyrics || track.plainLyrics;
  if (!rawLrc) {
    return {
      lines: [],
      title: track.name,
      artist: track.artistName,
      availability: 'unavailable',
    };
  }

  const parsedLines = parseLRC(rawLrc);
  const formattedLines: Line[] = parsedLines.map((line, idx) => {
    const nextLine = parsedLines[idx + 1];
    const endTime = nextLine ? nextLine.time : line.time + 5;
    return {
      fullText: line.text,
      startTime: line.time * 1000, // convert to ms
      endTime: endTime * 1000,
      words: [
        {
          text: line.text,
          startTime: line.time * 1000,
          endTime: endTime * 1000,
        },
      ],
    };
  });

  return {
    lines: formattedLines,
    title: track.name,
    artist: track.artistName,
    isWordByWord: false,
    availability: formattedLines.length ? 'available' : 'unavailable',
    origin: 'lrclib',
  };
}
