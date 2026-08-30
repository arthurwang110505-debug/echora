import {
  detectFormat,
  parseLyrics,
  type Line,
  type LyricData,
  type LyricLine,
  type LyricOrigin,
} from '@echora/core';

const UPLOADED_LYRICS_KEY = 'echora.uploaded-lyrics';

export const lyricsOriginLabel = (origin?: LyricOrigin) => {
  if (origin === 'upload') return '你上傳的歌詞檔';
  if (origin === 'demo-transcript') return '展示轉錄（非官方）';
  if (origin === 'bundled') return '內建展示歌詞';
  if (origin === 'lrclib') return '來自 LRCLib';
  return '';
};

export const toStageLyricData = (
  parsed: LyricLine[],
  meta: { title: string; artist: string; origin: LyricOrigin },
): LyricData => {
  const lines: Line[] = parsed.map((line, index) => {
    const next = parsed[index + 1];
    const fallbackEnd = next ? next.time : line.time + 5;
    const wordEnd = line.words?.at(-1)?.end;
    const endTime = (wordEnd ?? fallbackEnd) * 1000;
    const words = line.words?.length
      ? line.words.map((word, wordIndex) => ({
          text: word.text,
          startTime: word.time * 1000,
          endTime: (word.end ?? line.words?.[wordIndex + 1]?.time ?? fallbackEnd) * 1000,
        }))
      : [{ text: line.text, startTime: line.time * 1000, endTime }];
    return {
      fullText: line.text,
      startTime: line.time * 1000,
      endTime,
      words,
    };
  });

  return {
    title: meta.title,
    artist: meta.artist,
    origin: meta.origin,
    isWordByWord: parsed.some(line => Boolean(line.words?.length)),
    availability: lines.length ? 'available' : 'unavailable',
    lines,
  };
};

export const parseUploadedLyrics = (raw: string, title: string, artist: string): LyricData | null => {
  const format = detectFormat(raw);
  const parsed = parseLyrics(raw, format);
  if (!parsed.length) return null;
  return toStageLyricData(parsed, { title, artist, origin: 'upload' });
};

const songKey = (song: { source: string; id: string }) => `${song.source}:${song.id}`;

export const readUploadedLyrics = (song: { source: string; id: string }): LyricData | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(UPLOADED_LYRICS_KEY) || '{}');
    const value = stored[songKey(song)];
    return value?.lines ? value as LyricData : null;
  } catch {
    return null;
  }
};

export const writeUploadedLyrics = (song: { source: string; id: string }, lyrics: LyricData) => {
  if (typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(UPLOADED_LYRICS_KEY) || '{}');
    stored[songKey(song)] = lyrics;
    window.localStorage.setItem(UPLOADED_LYRICS_KEY, JSON.stringify(stored));
  } catch {
    // Upload persistence is optional.
  }
};
