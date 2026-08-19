import { describe, expect, it } from 'vitest';
import { isYouTubeSessionValid } from './youtubeAuth';

describe('isYouTubeSessionValid', () => {
  const now = 1_750_000_000_000;

  it('accepts a token that remains valid beyond the safety window', () => {
    expect(isYouTubeSessionValid({ accessToken: 'token', expiresAt: now + 90_000 }, now)).toBe(true);
  });

  it('rejects expired and near-expiry sessions before the UI can show a false connection state', () => {
    expect(isYouTubeSessionValid({ accessToken: 'token', expiresAt: now - 1 }, now)).toBe(false);
    expect(isYouTubeSessionValid({ accessToken: 'token', expiresAt: now + 20_000 }, now)).toBe(false);
    expect(isYouTubeSessionValid(null, now)).toBe(false);
  });
});

