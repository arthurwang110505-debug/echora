import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isRetryableYouTubeFailure,
  isYouTubeApiError,
  parseYouTubeApiErrorMessage,
  requestYouTubeJson,
  YouTubeApiError,
} from './youtubeRequest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const forbidden = (reason: string) => new Response(JSON.stringify({ error: { errors: [{ reason }] } }), {
  status: 403,
  headers: { 'Content-Type': 'application/json' },
});

const noSleep = () => Promise.resolve();

describe('YouTubeApiError classification', () => {
  it('treats only 429, 408 and 5xx as retryable', () => {
    expect(isRetryableYouTubeFailure(429)).toBe(true);
    expect(isRetryableYouTubeFailure(408)).toBe(true);
    expect(isRetryableYouTubeFailure(500)).toBe(true);
    expect(isRetryableYouTubeFailure(503)).toBe(true);
    expect(isRetryableYouTubeFailure(401)).toBe(false);
    expect(isRetryableYouTubeFailure(403)).toBe(false);
    expect(isRetryableYouTubeFailure(404)).toBe(false);
    expect(isRetryableYouTubeFailure(200)).toBe(false);
  });

  it('separates an auth failure from a configuration failure', () => {
    const expired = new YouTubeApiError('YouTube API failed: 401', { status: 401 });
    const disabledApi = new YouTubeApiError('YouTube API failed: 403 (accessNotConfigured)', {
      status: 403,
      reason: 'accessNotConfigured',
    });

    expect(expired.isAuthFailure).toBe(true);
    expect(expired.isConfigurationFailure).toBe(false);

    // A 403 is the token working and the project being wrong: logging the user
    // out here is exactly the bug this type exists to prevent.
    expect(disabledApi.isAuthFailure).toBe(false);
    expect(disabledApi.isConfigurationFailure).toBe(true);
  });

  it('recognises invalid_grant as an auth failure regardless of status', () => {
    const revoked = new YouTubeApiError('token exchange failed', { status: 400, reason: 'invalid_grant' });
    expect(revoked.isAuthFailure).toBe(true);
  });
});

describe('parseYouTubeApiErrorMessage', () => {
  it('recovers status and reason from the historical message format', () => {
    expect(parseYouTubeApiErrorMessage('YouTube API failed: 403 (quotaExceeded)')).toEqual({
      status: 403,
      reason: 'quotaExceeded',
    });
    expect(parseYouTubeApiErrorMessage('YouTube API failed: 502')).toEqual({ status: 502, reason: null });
  });

  it('returns null for anything that is not that format', () => {
    expect(parseYouTubeApiErrorMessage('YouTube 尚未登入')).toBeNull();
    expect(parseYouTubeApiErrorMessage('Network request failed')).toBeNull();
    expect(parseYouTubeApiErrorMessage('')).toBeNull();
  });
});

describe('requestYouTubeJson', () => {
  it('sends the bearer token and returns the parsed body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));

    const data = await requestYouTubeJson<{ items: Array<{ id: string }> }>('https://example.test/x', {
      accessToken: 'token-1',
      fetchImpl,
    });

    expect(data.items[0]?.id).toBe('a');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('omits the Authorization header when there is no token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await requestYouTubeJson('https://example.test/x', { fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeUndefined();
  });

  it('retries a 5xx once and returns the body when the retry succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    const data = await requestYouTubeJson<{ items: unknown[] }>('https://example.test/x', {
      accessToken: 't',
      fetchImpl,
      sleepImpl: noSleep,
    });

    expect(data.items).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 401 or a 403', async () => {
    const expired = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(requestYouTubeJson('https://example.test/x', {
      accessToken: 't', fetchImpl: expired, sleepImpl: noSleep,
    })).rejects.toBeInstanceOf(YouTubeApiError);
    expect(expired).toHaveBeenCalledTimes(1);

    const disabled = vi.fn().mockResolvedValue(forbidden('accessNotConfigured'));
    await expect(requestYouTubeJson('https://example.test/x', {
      accessToken: 't', fetchImpl: disabled, sleepImpl: noSleep,
    })).rejects.toThrow('YouTube API failed: 403 (accessNotConfigured)');
    expect(disabled).toHaveBeenCalledTimes(1);
  });

  it('carries the reason and status on the error it throws', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(forbidden('quotaExceeded'));

    await expect(requestYouTubeJson('https://example.test/x', {
      accessToken: 't', fetchImpl, sleepImpl: noSleep,
    })).rejects.toMatchObject({
      status: 403,
      reason: 'quotaExceeded',
      retryable: false,
    });
  });

  it('turns its own timeout into a retryable error instead of a bare AbortError', async () => {
    // Never resolves on its own; only the injected signal ends it.
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const failure = requestYouTubeJson('https://example.test/x', {
      accessToken: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
      maxRetries: 0,
      sleepImpl: noSleep,
    });

    await expect(failure).rejects.toMatchObject({ status: 0, reason: 'timeout', retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('lets the caller cancel without retrying or relabelling the error', async () => {
    const controller = new AbortController();
    const callerError = Object.assign(new Error('cancelled by caller'), { name: 'AbortError' });
    const fetchImpl = vi.fn().mockRejectedValue(callerError);

    controller.abort();

    await expect(requestYouTubeJson('https://example.test/x', {
      accessToken: 't',
      fetchImpl,
      signal: controller.signal,
      sleepImpl: noSleep,
    })).rejects.toBe(callerError);

    // A cancellation is not a failure of the remote service, so it must not be
    // retried: the caller has already moved on.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('wraps a transport failure as a network error with no status', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(requestYouTubeJson('https://example.test/x', {
      accessToken: 't', fetchImpl, maxRetries: 0, sleepImpl: noSleep,
    })).rejects.toMatchObject({ status: 0, reason: 'network' });
  });

  it('gives up after the retry budget instead of looping', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('busy', { status: 500 }));

    await expect(requestYouTubeJson('https://example.test/x', {
      accessToken: 't', fetchImpl, maxRetries: 2, sleepImpl: noSleep,
    })).rejects.toThrow('YouTube API failed: 500');

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
