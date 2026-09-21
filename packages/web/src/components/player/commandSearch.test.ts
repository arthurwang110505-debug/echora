import { describe, expect, it } from 'vitest';
import { scoreCommand, searchCommands } from './commandSearch';

const COMMANDS = [
  { id: 'play-pause', keywords: ['播放 / 暫停', 'play', 'pause', 'bofang'] },
  { id: 'next', keywords: ['下一首', 'next', 'xiayi'] },
  { id: 'theme', keywords: ['切換明暗主題', 'theme', 'dark', 'light'] },
  { id: 'panel', keywords: ['切換右側面板', 'panel', 'mianban'] },
];

describe('command search', () => {
  it('keeps every command, in order, for an empty query', () => {
    expect(searchCommands('', COMMANDS).map(c => c.id)).toEqual(['play-pause', 'next', 'theme', 'panel']);
    expect(searchCommands('   ', COMMANDS).map(c => c.id)).toHaveLength(4);
  });

  it('matches Chinese labels', () => {
    expect(searchCommands('播放', COMMANDS).map(c => c.id)).toEqual(['play-pause']);
    expect(searchCommands('面板', COMMANDS).map(c => c.id)).toEqual(['panel']);
  });

  it('matches English aliases and ignores case', () => {
    expect(searchCommands('NEXT', COMMANDS).map(c => c.id)).toEqual(['next']);
    expect(searchCommands('dark', COMMANDS).map(c => c.id)).toEqual(['theme']);
  });

  it('matches pinyin aliases', () => {
    expect(searchCommands('bofang', COMMANDS).map(c => c.id)).toEqual(['play-pause']);
    expect(searchCommands('mianban', COMMANDS).map(c => c.id)).toEqual(['panel']);
  });

  it('ranks a starts-with hit above a mid-string hit above a subsequence', () => {
    const startsWith = scoreCommand('pa', { id: 'a', keywords: ['panel'] });
    const midString = scoreCommand('pa', { id: 'b', keywords: ['expand panel'] });
    const subsequence = scoreCommand('pl', { id: 'c', keywords: ['panel'] });
    expect(startsWith).toBeGreaterThan(midString);
    expect(midString).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
  });

  it('returns 0 and drops the command when nothing matches', () => {
    expect(scoreCommand('zzz', { id: 'a', keywords: ['panel'] })).toBe(0);
    expect(searchCommands('zzz', COMMANDS)).toEqual([]);
  });

  it('prefers a tighter subsequence spread', () => {
    const tight = scoreCommand('pn', { id: 'a', keywords: ['panel'] });
    const loose = scoreCommand('pn', { id: 'b', keywords: ['pick something new now'] });
    expect(tight).toBeGreaterThan(loose);
  });
});
