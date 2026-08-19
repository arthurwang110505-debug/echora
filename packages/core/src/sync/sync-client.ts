import type { SyncData } from './sync-types';

const SYNC_ENDPOINT = 'https://sync.echora.example.com/api';

export interface SyncConfig {
  token: string;
  endpoint?: string;
}

// Upload sync data
export async function uploadSyncData(config: SyncConfig, data: SyncData): Promise<void> {
  const response = await fetch(`${config.endpoint || SYNC_ENDPOINT}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Sync upload failed: ${response.status}`);
  }
}

// Download sync data
export async function downloadSyncData(config: SyncConfig): Promise<SyncData | null> {
  const response = await fetch(`${config.endpoint || SYNC_ENDPOINT}/sync`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.token}`,
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
  const response = await fetch(`${config.endpoint || SYNC_ENDPOINT}/sync/status`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    return { pending: false };
  }

  return (await response.json()) as { lastSync?: number; pending: boolean };
}
