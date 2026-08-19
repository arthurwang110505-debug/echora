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

    // 1. Try exact match API
    let res = await fetch(`https://lrclib.net/api/get?${query.toString()}`);
    
    if (!res.ok) {
      // 2. Fallback to search API if exact match fails
      const searchQuery = new URLSearchParams({
        q: `${params.trackName} ${params.artistName}`.trim(),
      });
      const searchRes = await fetch(`https://lrclib.net/api/search?${searchQuery.toString()}`);
      if (searchRes.ok) {
        const searchResults: LrcLibTrack[] = await searchRes.json();
        if (searchResults && searchResults.length > 0) {
          // Find best candidate with syncedLyrics
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

function processLrcLibTrack(track: LrcLibTrack): LyricData | null {
  if (track.instrumental) {
    return {
      lines: [
        {
          fullText: '🎵 [純音樂 / Instrumental]',
          startTime: 0,
          endTime: 999000,
          words: [{ text: '🎵 [純音樂 / Instrumental]', startTime: 0, endTime: 999000 }],
        },
      ],
      title: track.name,
      artist: track.artistName,
    };
  }

  const rawLrc = track.syncedLyrics || track.plainLyrics;
  if (!rawLrc) return null;

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
  };
}
