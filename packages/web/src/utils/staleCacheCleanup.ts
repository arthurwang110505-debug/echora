// src/utils/staleCacheCleanup.ts
//
// One-off deletion of service-worker caches that newer builds no longer write.
// The retired `demo-audio-cache` held up to 12 opaque `files.manuscdn.com` responses
// (tens of megabytes) that no request will ever match again, so leaving them behind is
// pure disk cost - and an opaque body is exactly what must not be reused once the
// player asks for audio in CORS mode.

const RETIRED_CACHE_NAMES = ['demo-audio-cache', 'demo-audio-cache-v1'];

export const cleanupStaleAudioCaches = async (): Promise<string[]> => {
  if (typeof window === 'undefined' || !('caches' in window)) return [];
  try {
    const names = await window.caches.keys();
    const stale = names.filter(name => RETIRED_CACHE_NAMES.includes(name));
    await Promise.all(stale.map(name => window.caches.delete(name)));
    return stale;
  } catch {
    // Storage can be unavailable (private mode, disabled cookies); cleanup is optional.
    return [];
  }
};
