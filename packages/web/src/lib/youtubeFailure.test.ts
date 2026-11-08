import { describe, expect, it } from 'vitest';
import { failureHintKey, failureMessageKey, resolveFailureAction, type YouTubeFailureCode } from './youtubeFailure';
import shellZh from '../i18n/locales/shell.zh-TW.json';
import shellEn from '../i18n/locales/shell.en.json';

/**
 * A failure is a value: a code, plus optional evidence. These tests hold the two things that
 * breaks if that is taken loosely - a code with no message (renders as a raw key) and a code with
 * no decided action (a screen invents its own button).
 */

const CODES: YouTubeFailureCode[] = [
  'not_connected', 'auth_expired', 'api_disabled', 'quota_exceeded', 'account_forbidden',
  'access_denied', 'search_limited', 'upstream_unavailable', 'player_error', 'no_playable_video',
  'missing_query', 'empty_library', 'misconfigured', 'unknown',
];

describe('failure copy is total', () => {
  it.each(CODES)('%s has a Traditional Chinese message', code => {
    expect(shellZh.youtubeFailure).toHaveProperty(code);
    expect((shellZh.youtubeFailure as Record<string, string>)[code].length).toBeGreaterThan(0);
  });

  it.each(CODES)('%s has an English message', code => {
    expect(shellEn.youtubeFailure).toHaveProperty(code);
  });

  it('has the same keys in both languages', () => {
    // A missing translation falls back to the key name, which is worse than no message at all.
    expect(Object.keys(shellZh.youtubeFailure).sort()).toEqual(Object.keys(shellEn.youtubeFailure).sort());
  });

  it('builds a key that actually resolves', () => {
    for (const code of CODES) {
      const key = failureMessageKey(code).replace('youtubeFailure.', '');
      expect(shellZh.youtubeFailure).toHaveProperty(key);
    }
  });

  it('every hint key resolves too', () => {
    for (const code of CODES) {
      const hint = failureHintKey(code);
      if (!hint) continue;
      expect(shellZh.youtubeFailure).toHaveProperty(hint.replace('youtubeFailure.', ''));
      expect(shellEn.youtubeFailure).toHaveProperty(hint.replace('youtubeFailure.', ''));
    }
  });
});

describe('failure copy is short', () => {
  it('keeps every primary message under a phone-sized limit', () => {
    // The problem this replaces: the old 403 text ran past 100 characters and was unreadable on the
    // device where it is most often seen. The remedy moved to the hint line, which can be dropped.
    for (const code of CODES) {
      const message = (shellZh.youtubeFailure as Record<string, string>)[code];
      expect({ code, length: message.length }).toMatchObject({ length: expect.any(Number) });
      expect(message.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('resolveFailureAction', () => {
  it.each(CODES)('%s has a decided action', code => {
    expect(['connect', 'retry', 'open_console', 'none']).toContain(resolveFailureAction(code));
  });

  it('offers a sign-in for a dead token, because nothing else fixes it', () => {
    expect(resolveFailureAction('auth_expired')).toBe('connect');
    expect(resolveFailureAction('not_connected')).toBe('connect');
  });

  it('offers a retry only where retrying can help', () => {
    expect(resolveFailureAction('upstream_unavailable')).toBe('retry');
    // Retrying a spent daily quota just fails again; the user needs the console.
    expect(resolveFailureAction('quota_exceeded')).toBe('open_console');
    expect(resolveFailureAction('api_disabled')).toBe('open_console');
  });

  it('offers nothing where only a different choice helps', () => {
    // Picking a different track is the remedy; a button here would be a lie.
    expect(resolveFailureAction('no_playable_video')).toBe('none');
    expect(resolveFailureAction('search_limited')).toBe('none');
  });
});
