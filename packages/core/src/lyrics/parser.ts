import type { LyricLine, LyricWord } from './types';

const normalizeRepeatedToken = (value: string) => {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  const half = trimmed.length / 2;
  if (Number.isInteger(half) && half > 0) {
    const first = trimmed.slice(0, half);
    const second = trimmed.slice(half);
    if (first === second && /^[A-Za-zÀ-ÿ'’\-]+$/.test(first)) return first;
  }
  return trimmed;
};

// LRC parser - standard [mm:ss.xx] format
export function parseLRC(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const msStr = match[3].padEnd(3, '0');
    const ms = parseInt(msStr, 10);
    const text = normalizeRepeatedToken(match[4]);

    if (text) {
      lines.push({
        time: minutes * 60 + seconds + ms / 1000,
        text,
      });
    }
  }

  return lines
    .sort((a, b) => a.time - b.time)
    .filter((line, index, sorted) => index === 0 || line.time !== sorted[index - 1].time || line.text !== sorted[index - 1].text);
}

// YRC parser - word-level timing with enhanced LRC format
// Format: [mm:ss.xx]word1{start:end}word2{start:end}...
export function parseYRC(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let lineMatch;

  while ((lineMatch = lineRegex.exec(raw)) !== null) {
    const minutes = parseInt(lineMatch[1], 10);
    const seconds = parseInt(lineMatch[2], 10);
    const msStr = lineMatch[3].padEnd(3, '0');
    const ms = parseInt(msStr, 10);
    const lineTime = minutes * 60 + seconds + ms / 1000;
    const content = lineMatch[4];

    // Parse word-level timing: word{mm:ss.xx:mm:ss.xx}
    const words: LyricWord[] = [];
    const wordRegex = /([^{}]+)\{(\d{2}):(\d{2})\.(\d{2,3})-(\d{2}):(\d{2})\.(\d{2,3})\}/g;
    let wordMatch;

    let lastIndex = 0;
    while ((wordMatch = wordRegex.exec(content)) !== null) {
      // Text before this word
      const beforeWord = content.slice(lastIndex, wordMatch.index);
      if (beforeWord) {
        words.push({
          time: lineTime,
          text: beforeWord,
        });
      }

      const wStartMin = parseInt(wordMatch[2], 10);
      const wStartSec = parseInt(wordMatch[3], 10);
      const wStartMs = parseInt(wordMatch[4].padEnd(3, '0'), 10);
      const wEndMin = parseInt(wordMatch[5], 10);
      const wEndSec = parseInt(wordMatch[6], 10);
      const wEndMs = parseInt(wordMatch[7].padEnd(3, '0'), 10);

      words.push({
        time: wStartMin * 60 + wStartSec + wStartMs / 1000,
        text: wordMatch[1],
        end: wEndMin * 60 + wEndSec + wEndMs / 1000,
      });
      lastIndex = wordMatch.index + wordMatch[0].length;
    }

    // Remaining text
    const remaining = content.slice(lastIndex);
    if (remaining) {
      words.push({
        time: lineTime,
        text: remaining,
      });
    }

    lines.push({
      time: lineTime,
      text: content,
      words: words.length > 0 ? words : undefined,
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

// VTT parser
export function parseVTT(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const linesArr = raw.split('\n');
  let i = 0;

  // Skip header
  while (i < linesArr.length && !linesArr[i].includes('-->')) {
    i++;
  }

  // Parse timing blocks
  while (i < linesArr.length) {
    const timingLine = linesArr[i];
    const timingMatch = timingLine.match(/(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2})\.(\d{3})/);

    if (timingMatch) {
      const startMin = parseInt(timingMatch[1], 10);
      const startSec = parseInt(timingMatch[2], 10);
      const startMs = parseInt(timingMatch[3], 10);

      // Collect text lines until next timing or end
      i++;
      let text = '';
      while (i < linesArr.length && !linesArr[i].includes('-->')) {
        text += linesArr[i] + ' ';
        i++;
      }

      if (text.trim()) {
        lines.push({
          time: startMin * 60 + startSec + startMs / 1000,
          text: text.trim(),
        });
      }
    } else {
      i++;
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

// QRC parser (QQ Music format) - JSON based
export function parseQRC(raw: string): LyricLine[] {
  try {
    const data = JSON.parse(raw);
    const lines: LyricLine[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.time !== undefined && item.content) {
          lines.push({
            time: item.time / 1000, // convert ms to seconds
            text: item.content,
          });
        }
      }
    }

    return lines.sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

// TTML parser
export function parseTTML(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /<p.*?begin="([^"]+)".*?end="([^"]+)".*?>(.*?)<\/p>/gs;
  let match;

  while ((match = lineRegex.exec(raw)) !== null) {
    const startTime = parseTimeCode(match[1]);
    const text = match[3].replace(/<[^>]+>/g, '').trim();

    if (text) {
      lines.push({
        time: startTime,
        text,
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

// KRC parser (KuGou format) - encrypted/obfuscated
export function parseKRC(raw: string): LyricLine[] {
  try {
    const binary = atob(raw.trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const timeRegex = /time="([^"]+)"/g;
    const textRegex = /text="([^"]+)"/g;
    const lines: LyricLine[] = [];

    let timeMatch, textMatch;
    const times: number[] = [];
    const texts: string[] = [];

    while ((timeMatch = timeRegex.exec(decoded)) !== null) {
      times.push(parseFloat(timeMatch[1]));
    }
    while ((textMatch = textRegex.exec(decoded)) !== null) {
      texts.push(textMatch[1]);
    }

    for (let i = 0; i < Math.min(times.length, texts.length); i++) {
      lines.push({
        time: times[i],
        text: texts[i],
      });
    }

    return lines.sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

// TTML time code parser
function parseTimeCode(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// Main parser dispatcher
export function parseLyrics(raw: string, format: string): LyricLine[] {
  switch (format.toLowerCase()) {
    case 'lrc':
      return parseLRC(raw);
    case 'yrc':
      return parseYRC(raw);
    case 'vtt':
      return parseVTT(raw);
    case 'qrc':
      return parseQRC(raw);
    case 'ttml':
      return parseTTML(raw);
    case 'krc':
      return parseKRC(raw);
    default:
      if (raw.includes('[') && raw.match(/\[\d{2}:\d{2}\]/)) {
        return parseLRC(raw);
      }
      return [];
  }
}

// Detect format from content
export function detectFormat(raw: string): string {
  if (raw.startsWith('<?xml') || raw.includes('<ttml')) {
    return 'ttml';
  }
  // Enhanced LRC/YRC must be checked before the generic bracket-based
  // formats, otherwise every timestamped lyric is incorrectly classified as
  // QRC just because it starts with "[".
  if (/\[\d{2}:\d{2}\.\d{2,3}\].*\{\d{2}:\d{2}\.\d{2,3}-/.test(raw)) {
    return 'yrc';
  }
  if (/\[\d{2}:\d{2}\.\d{2,3}\]/.test(raw)) {
    return 'lrc';
  }
  if (raw.startsWith('{')) {
    return 'qrc';
  }
  if (raw.includes('-->')) {
    return 'vtt';
  }
  if (raw.includes('time="') && raw.includes('text="')) {
    return 'krc';
  }
  if (raw.includes('{') && raw.match(/\[\d{2}:\d{2}\]\{.*?\}/)) {
    return 'yrc';
  }
  if (raw.match(/\[\d{2}:\d{2}\]\s/)) {
    return 'lrc';
  }
  return 'txt';
}

// Chorus detection - simple heuristic based on repetition
export function detectChorus(lines: LyricLine[]): LyricLine[] {
  const textCounts = new Map<string, number>();
  for (const line of lines) {
    textCounts.set(line.text, (textCounts.get(line.text) || 0) + 1);
  }

  return lines.map(line => ({
    ...line,
    isChorus: (textCounts.get(line.text) || 0) > 1,
  }));
}

// Merge multiple lyric sources with priority
export function mergeLyrics(
  primary: LyricLine[],
  secondary: LyricLine[]
): LyricLine[] {
  const hasWordTiming = primary.some(line => line.words && line.words.length > 0);
  return hasWordTiming ? primary : secondary;
}

// Apply timing offset
export function applyOffset(lines: LyricLine[], offset: number): LyricLine[] {
  return lines.map(line => ({
    ...line,
    time: line.time + offset,
    words: line.words?.map(word => ({
      ...word,
      time: word.time + offset,
      end: word.end !== undefined ? word.end + offset : undefined,
    })),
  }));
}
