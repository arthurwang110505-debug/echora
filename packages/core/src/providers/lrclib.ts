// LRCLib Provider - Zero-config free lyrics API (https://lrclib.net)
import type { LyricData, Line } from '../types';
import { parseLRC } from '../lyrics/parser';

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

export async function fetchLrcLibLyrics(params: {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
}): Promise<LyricData | null> {
  try {
    const query = new URLSearchParams();
    query.set('track_name', params.trackName);
    query.set('artist_name', params.artistName);
    if (params.albumName) query.set('album_name', params.albumName);
    if (params.duration) query.set('duration', Math.round(params.duration).toString());

    let res = await fetchLrcLib(`https://lrclib.net/api/get?${query.toString()}`);
    
    if (!res.ok) {
      const searchQuery = new URLSearchParams({
        q: `${params.trackName} ${params.artistName}`.trim(),
      });
      const searchRes = await fetchLrcLib(`https://lrclib.net/api/search?${searchQuery.toString()}`);
      if (searchRes.ok) {
        const searchResults: LrcLibTrack[] = await searchRes.json();
        if (searchResults && searchResults.length > 0) {
          const candidate = searchResults.find(t => t.syncedLyrics) || searchResults[0];
          return processLrcLibTrack(candidate);
        }
      }
      return null;
    }

    const data: LrcLibTrack = await res.json();
    return processLrcLibTrack(data);
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
