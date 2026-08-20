import { ReactNode, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';

export function PlayerProvider({ children }: { children: ReactNode }) {
  const restoreSpotifySession = usePlayerStore(state => state.restoreSpotifySession);
  const syncSpotifyPlayback = usePlayerStore(state => state.syncSpotifyPlayback);
  const restoreYouTubeSession = usePlayerStore(state => state.restoreYouTubeSession);
  const restorePlaybackSnapshot = usePlayerStore(state => state.restorePlaybackSnapshot);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const currentSong = usePlayerStore(state => state.currentSong);
  const currentTime = usePlayerStore(state => state.currentTime);
  const duration = usePlayerStore(state => state.duration);
  const tickTime = usePlayerStore(state => state.tickTime);

  useEffect(() => {
    restorePlaybackSnapshot();
    void restoreSpotifySession();
    void restoreYouTubeSession();
    const timer = window.setInterval(() => void syncSpotifyPlayback(), 5000);
    return () => window.clearInterval(timer);
  }, [restorePlaybackSnapshot, restoreSpotifySession, restoreYouTubeSession, syncSpotifyPlayback]);

  // YouTube and Spotify report real time through their own player APIs. Only local playback may use a UI ticker.
  useEffect(() => {
    if (!isPlaying || currentSong?.source === 'spotify' || currentSong?.source === 'ytmusic') return;

    let lastTime = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;
      if (!document.hidden) {
        tickTime(deltaSec);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [currentSong?.source, isPlaying, tickTime]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      if (currentSong) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artists[0]?.name || 'Echora',
          album: currentSong.album?.name,
          artwork: currentSong.coverUrl ? [{ src: currentSong.coverUrl, sizes: '512x512', type: 'image/svg+xml' }] : [],
        });
        if (duration > 0) navigator.mediaSession.setPositionState({ duration, position: Math.min(Math.max(currentTime, 0), duration) });
      }
      navigator.mediaSession.setActionHandler('play', () => { const state = usePlayerStore.getState(); if (!state.isPlaying) state.playPause(); });
      navigator.mediaSession.setActionHandler('pause', () => { const state = usePlayerStore.getState(); if (state.isPlaying) state.pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => usePlayerStore.getState().next());
      navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().prev());
      navigator.mediaSession.setActionHandler('seekto', details => { if (typeof details.seekTime === 'number') usePlayerStore.getState().seek(details.seekTime); });
    } catch {
      // Media Session is optional; unsupported actions must never block page controls.
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch {
        // Ignore partial Media Session implementations.
      }
    };
  }, [currentSong, currentTime, duration, isPlaying]);

  return <>{children}</>;
}

export const usePlayer = usePlayerStore;
export { usePlayerStore };
