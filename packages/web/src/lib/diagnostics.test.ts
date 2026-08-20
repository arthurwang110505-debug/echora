import { describe, expect, it } from 'vitest';
import { createDiagnosticSummary, getDiagnosticLabel, readDiagnosticEvents } from './diagnostics';

describe('diagnostic event storage', () => {
  it('returns an empty list when browser storage is unavailable', () => {
    expect(readDiagnosticEvents()).toEqual([]);
  });

  it('maps engineering event names to human-readable Traditional Chinese labels', () => {
    expect(getDiagnosticLabel('pause_requested')).toBe('已要求暫停');
    expect(getDiagnosticLabel('youtube_error')).toBe('YouTube 播放器錯誤');
  });

  it('creates a privacy-safe summary without diagnostic detail values', () => {
    const summary = createDiagnosticSummary([{ id: 1, name: 'youtube_error', createdAt: 0, details: { token: 'do-not-copy', title: 'do-not-copy' } }]);

    expect(summary).toContain('YouTube 播放器錯誤');
    expect(summary).toContain('不含帳號、token、歌名或歌詞');
    expect(summary).not.toContain('do-not-copy');
  });
});
