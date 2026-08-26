import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAgnesTheme, getAgnesApiStatus } from './agnesAi';

const mockJsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('Agnes AI client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads server configuration status without sending a browser key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ provider: 'agnes', configured: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAgnesApiStatus()).resolves.toBe('configured');
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/status', expect.objectContaining({
      headers: { Accept: 'application/json' },
    }));
  });

  it('maps an unconfigured server to a missing status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ provider: 'agnes', configured: false })));

    await expect(getAgnesApiStatus()).resolves.toBe('missing');
  });

  it('posts only theme context to the same-origin proxy', async () => {
    const response = {
      light: {
        name: 'Light', backgroundColor: '#ffffff', primaryColor: '#111111', accentColor: '#22aa88', secondaryColor: '#555555', provider: 'Agnes AI',
      },
      dark: {
        name: 'Dark', backgroundColor: '#111111', primaryColor: '#ffffff', accentColor: '#22aa88', secondaryColor: '#bbbbbb', provider: 'Agnes AI',
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAgnesTheme({ lyricsText: 'hello', isPureMusic: false, songTitle: 'Demo' })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/theme', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ lyricsText: 'hello', isPureMusic: false, songTitle: 'Demo' }),
    }));
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('surfaces server error messages to Settings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ error: 'AI 主題服務尚未設定。' }, 503)));

    await expect(getAgnesApiStatus()).rejects.toThrow('AI 主題服務尚未設定。');
  });
});
