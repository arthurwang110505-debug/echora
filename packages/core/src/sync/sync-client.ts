import type { SyncData } from './sync-types';

/**
 * Cross-device sync client (NOT YET WIRED INTO THE APP).
 *
 * This module is intentionally dormant: nothing in the web app imports it yet,
 * and there is no hosted sync service behind it. It exists as a scaffold so the
 * favourites / appearance / lyrics-offset backup story has a home when a backend
 * is built. Callers must supply a real `endpoint`; there is no default, so the
 * client fails loudly instead of pretending to talk to a placeholder host.
 */

export interface SyncConfig {
  token: string;
  endpoint: string;
}

const requireEndpoint = (config: SyncConfig): string => {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) {
    throw new Error('跨裝置同步尚未啟用：請先設定同步服務的 endpoint。');
  }
  return endpoint;
};

// Upload sync data
export async function uploadSyncData(config: SyncConfig, data: SyncData): Promise<void> {
  const response = await fetch(`${requireEndpoint(config)}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Sync upload failed: ${response.status}`);
  }
}

// Download sync data
export async function downloadSyncData(config: SyncConfig): Promise<SyncData | null> {
  const response = await fetch(`${requireEndpoint(config)}/sync`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Sync download failed: ${response.status}`);
  }

  return (await response.json()) as SyncData;
}

// Check sync status
export async function checkSyncStatus(config: SyncConfig): Promise<{ lastSync?: number; pending: boolean }> {
  const response = await fetch(`${requireEndpoint(config)}/sync/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    return { pending: false };
  }

  return (await response.json()) as { lastSync?: number; pending: boolean };
}
