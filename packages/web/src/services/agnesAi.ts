import type { ThemeConfig } from '@echora/core';

export interface AgnesThemeRequest {
  lyricsText: string;
  isPureMusic: boolean;
  songTitle?: string;
}

export interface AgnesThemeResponse {
  light: ThemeConfig;
  dark: ThemeConfig;
}

export type AgnesApiStatus = 'configured' | 'missing' | 'unavailable';

interface AgnesStatusResponse {
  configured?: boolean;
}

interface AgnesErrorPayload {
  error?: string;
  message?: string;
}

const parseErrorMessage = (payload: unknown, fallback: string): string => {
  if (typeof payload === 'object' && payload !== null) {
    const candidate = payload as AgnesErrorPayload;
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
  }
  return fallback;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('無法連線到 AI 主題服務，請檢查網路或稍後再試。');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, `AI 主題服務暫時無法使用（HTTP ${response.status}）。`));
  }
  return payload as T;
};

export async function getAgnesApiStatus(): Promise<AgnesApiStatus> {
  const payload = await requestJson<AgnesStatusResponse>('/api/ai/status');
  return payload.configured ? 'configured' : 'missing';
}

export async function generateAgnesTheme(request: AgnesThemeRequest): Promise<AgnesThemeResponse> {
  return requestJson<AgnesThemeResponse>('/api/ai/theme', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
