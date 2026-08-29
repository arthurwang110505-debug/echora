import { describe, expect, it } from 'vitest';
import { lyricsOriginLabel, parseUploadedLyrics } from './lyricsImport';

describe('lyrics import', () => {
  it('parses an uploaded LRC file into stage lines', () => {
    const lyrics = parseUploadedLyrics('[00:01.00]Hello world\n[00:04.00]Second line', 'Demo', 'Artist');
    expect(lyrics?.origin).toBe('upload');
    expect(lyrics?.lines).toHaveLength(2);
    expect(lyrics?.lines[0].fullText).toBe('Hello world');
    expect(lyricsOriginLabel('upload')).toBe('你上傳的歌詞檔');
  });

  it('rejects empty files', () => {
    expect(parseUploadedLyrics('not lyrics', 'Demo', 'Artist')).toBeNull();
  });
});
