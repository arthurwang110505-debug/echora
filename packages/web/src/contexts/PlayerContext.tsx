import { ReactNode, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';

export function PlayerProvider({ children }: { children: ReactNode }) {
  const restoreSpotifySession = usePlayerStore(state => state.restoreSpotifySession);
  const syncSpotifyPlayback = usePlayerStore(state => state.syncSpotifyPlayback);
  const restoreYouTubeSession = usePlayerStore(state => state.restoreYouTubeSession);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const spotifyConnected = usePlayerStore(state => state.spotifyConnected);
  const tickTime = usePlayerStore(state => state.tickTime);

  useEffect(() => {
    void restoreSpotifySession();
    void restoreYouTubeSession();
    const timer = window.setInterval(() => void syncSpotifyPlayback(), 5000);
    return () => window.clearInterval(timer);
  }, [restoreSpotifySession, restoreYouTubeSession, syncSpotifyPlayback]);

  // High precision smooth playback ticker (updates every 100ms when playing without Spotify active sync)
  useEffect(() => {
    if (!isPlaying || spotifyConnected) return;

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
  }, [isPlaying, spotifyConnected, tickTime]);

  return <>{children}</>;
}

export const usePlayer = usePlayerStore;
export { usePlayerStore };
