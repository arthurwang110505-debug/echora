import { describe, it, expect } from 'vitest';
import { parseLRC, parseYRC, parseVTT, parseLyrics, detectFormat, detectChorus } from './parser';

describe('LRC Parser', () => {
  it('should parse basic LRC', () => {
    const lrc = '[00:00.00]First line\n[00:05.00]Second line\n[00:10.00]Third line';
    const result = parseLRC(lrc);
    expect(result).toHaveLength(3);
    expect(result[0].time).toBe(0);
    expect(result[0].text).toBe('First line');
    expect(result[1].time).toBe(5);
  });

  it('should parse milliseconds', () => {
    const lrc = '[00:01.23]Test line';
    const result = parseLRC(lrc);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBeCloseTo(1.23, 1);
  });

  it('parses enhanced word timestamps', () => {
    const result = parseLRC('[00:01.00]<00:01.00>Hello <00:01.40>world');
    expect(result[0].text).toBe('Hello world');
    expect(result[0].words?.map(word => word.text)).toEqual(['Hello ', 'world']);
    expect(result[0].words?.[0].time).toBeCloseTo(1, 2);
    expect(result[0].words?.[1].time).toBeCloseTo(1.4, 2);
  });

  it('normalizes accidentally duplicated latin tokens and duplicate timestamps', () => {
    const result = parseLRC('[00:01.00]I\'mI\'m\n[00:01.00]I\'mI\'m\n[00:02.00]trynatryna');

    expect(result).toEqual([
      { time: 1, text: "I'm" },
      { time: 2, text: 'tryna' },
    ]);
  });
});

describe('YRC Parser', () => {
  it('should parse word-level timing', () => {
    const yrc = '[00:00.00]Hello{00:00.00-00:00.50}World{00:00.50-00:01.00}!';
    const result = parseYRC(yrc);
    expect(result).toHaveLength(1);
    expect(result[0].words).toHaveLength(3);
  });
});

describe('VTT Parser', () => {
  it('should parse VTT format', () => {
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:05.000\nFirst line\n\n00:05.000 --> 00:10.000\nSecond line';
    const result = parseVTT(vtt);
    expect(result).toHaveLength(2);
  });

  it('parses hour timestamps and skips cue identifiers', () => {
    const vtt = 'WEBVTT\n\n1\n00:01:02.000 --> 00:01:05.000\nHour line';
    const result = parseVTT(vtt);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBeCloseTo(62, 1);
    expect(result[0].text).toBe('Hour line');
  });
});

describe('Format Detection', () => {
  it('should detect LRC format', () => {
    expect(detectFormat('[00:00.00]Test')).toBe('lrc');
  });

  it('should detect YRC format', () => {
    expect(detectFormat('[00:00.00]Hello{00:00.00-00:00.50}World')).toBe('yrc');
  });
});

describe('Chorus Detection', () => {
  it('should mark repeated lines as chorus', () => {
    const lines = [
      { time: 0, text: 'Chorus line' },
      { time: 5, text: 'Verse line' },
      { time: 10, text: 'Chorus line' },
    ];
    const result = detectChorus(lines);
    expect(result[0].isChorus).toBe(true);
    expect(result[1].isChorus).toBe(false);
    expect(result[2].isChorus).toBe(true);
  });
});
