import { useEffect, useRef } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { extractYouTubeVideoId } from '@echora/core';

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void; } }

export function getYouTubeSurfaceClass(immersive: boolean) {
  return immersive
    ? 'fixed bottom-[max(6rem,env(safe-area-inset-bottom))] left-1/2 z-[60] w-[min(356px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#62f5c4]/45 bg-black shadow-2xl md:bottom-20 md:left-auto md:right-5 md:translate-x-0'
    : 'fixed bottom-5 right-5 z-[60] w-[min(356px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#62f5c4]/45 bg-black shadow-2xl';
}

export default function YouTubePlayer({ immersive = false, concealed = false }: { immersive?: boolean; concealed?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const disposedRef = useRef(false);
  const { currentSong, isPlaying, volume } = usePlayer();

  useEffect(() => {
    if (currentSong?.source !== 'ytmusic') return;
    disposedRef.current = false;
    if (!hostRef.current && containerRef.current) {
      const host = document.createElement('div');
      hostRef.current = host;
      containerRef.current.replaceChildren(host);
    }
    const create = () => {
      if (disposedRef.current || !hostRef.current || !window.YT?.Player || playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '356',
        height: '200',
        playerVars: { playsinline: 1, origin: window.location.origin, controls: 0, rel: 0 },
        events: {
          onReady: (event: any) => {
            const state = usePlayer.getState();
            const videoId = extractYouTubeVideoId(state.currentSong?.audioUrl || state.currentSong?.id);
            if (typeof event.target.setVolume === 'function') event.target.setVolume(Math.round(state.volume * 100));
            if (videoId) {
              event.target.cueVideoById(videoId);
              usePlayer.setState({ isPlaying: false, playbackState: 'paused', currentTime: 0, youtubeError: null });
            }
          },
          onStateChange: (event: any) => {
            if (disposedRef.current) return;
            const state = usePlayer.getState();
            const duration = Number(event.target.getDuration?.() || state.duration);
            const currentTime = Number(event.target.getCurrentTime?.() || 0);
            if (event.data === window.YT.PlayerState.PLAYING) usePlayer.setState({ isPlaying: true, playbackState: 'playing', currentTime: Number.isFinite(currentTime) ? currentTime : state.currentTime, duration: Number.isFinite(duration) ? duration : state.duration, youtubeError: null });
            if (event.data === window.YT.PlayerState.BUFFERING) usePlayer.setState({ isPlaying: false, playbackState: 'buffering', currentTime: Number.isFinite(currentTime) ? currentTime : state.currentTime, duration: Number.isFinite(duration) ? duration : state.duration });
            if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.CUED) usePlayer.setState({ isPlaying: false, playbackState: 'paused', currentTime, duration });
            if (event.data === window.YT.PlayerState.ENDED) usePlayer.setState({ isPlaying: false, playbackState: 'ended', currentTime, duration });
          },
          onError: (event: any) => {
            const messages: Record<number, string> = {
              2: 'YouTube 拒絕了這支影片的播放參數。',
              5: '此影片無法由 HTML5 播放器播放。',
              100: '此影片已不存在或設為私人。',
              101: '影片擁有者禁止在其他網站嵌入播放。',
              150: '影片擁有者禁止在其他網站嵌入播放。',
            };
            usePlayer.setState({ isPlaying: false, playbackState: 'error', youtubeError: messages[event.data] || 'YouTube 無法播放此影片。' });
          },
        },
      });
    };
    const readyHandler = () => create();
    if (window.YT?.Player) create();
    else {
      window.onYouTubeIframeAPIReady = readyHandler;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
      }
    }
    return () => {
      disposedRef.current = true;
      if (window.onYouTubeIframeAPIReady === readyHandler) window.onYouTubeIframeAPIReady = undefined;
      const player = playerRef.current;
      playerRef.current = null;
      try { player?.stopVideo?.(); } catch { /* The player may have been removed by the browser. */ }
      try { player?.destroy?.(); } catch { /* The player may have already disposed itself. */ }
      hostRef.current = null;
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [currentSong?.source]);

  useEffect(() => {
    const onLoad = (event: Event) => {
      const videoId = extractYouTubeVideoId((event as CustomEvent).detail.videoId);
      if (!videoId) {
        usePlayer.setState({ isPlaying: false, playbackState: 'error', youtubeError: '缺少有效的 YouTube video ID。' });
        return;
      }
      if (!disposedRef.current && typeof playerRef.current?.loadVideoById === 'function') playerRef.current.loadVideoById(videoId);
    };
    const onPlay = () => { if (!disposedRef.current && typeof playerRef.current?.playVideo === 'function') playerRef.current.playVideo(); };
    const onPause = () => { if (!disposedRef.current && typeof playerRef.current?.pauseVideo === 'function') playerRef.current.pauseVideo(); };
    const onSeek = (event: Event) => { if (typeof playerRef.current?.seekTo === 'function') playerRef.current.seekTo((event as CustomEvent<number>).detail, true); };
    window.addEventListener('echora:youtube-load', onLoad); window.addEventListener('echora:youtube-play', onPlay); window.addEventListener('echora:youtube-pause', onPause); window.addEventListener('echora:youtube-seek', onSeek);
    return () => { window.removeEventListener('echora:youtube-load', onLoad); window.removeEventListener('echora:youtube-play', onPlay); window.removeEventListener('echora:youtube-pause', onPause); window.removeEventListener('echora:youtube-seek', onSeek); };
  }, []);

  useEffect(() => {
    if (typeof playerRef.current?.setVolume === 'function') playerRef.current.setVolume(Math.round((volume || 0) * 100));
  }, [volume]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (disposedRef.current || typeof playerRef.current?.getCurrentTime !== 'function' || currentSong?.source !== 'ytmusic') return;
      const state = usePlayer.getState();
      if (!state.isPlaying) return;
      const currentTime = Number(playerRef.current.getCurrentTime() || 0);
      const duration = Number(playerRef.current.getDuration?.() || state.duration);
      if (Number.isFinite(currentTime) && Number.isFinite(duration) && Math.abs(currentTime - state.currentTime) > 0.04) usePlayer.setState({ currentTime, duration });
    }, 100);
    return () => window.clearInterval(timer);
  }, [currentSong]);

  // The official IFrame Player API requires a rendered viewport of at least 200×200px.
  // Keep its native play surface visible until the user starts audio so browsers can preserve the gesture.
  const awaitingUserGesture = currentSong?.source === 'ytmusic' && !isPlaying;
  const visibleSurfaceClass = getYouTubeSurfaceClass(immersive);
  return <div className={concealed
    ? `${visibleSurfaceClass} pointer-events-none opacity-0`
    : awaitingUserGesture
    ? visibleSurfaceClass
    : 'pointer-events-none fixed -left-[10000px] top-0 h-[200px] w-[356px] overflow-hidden'} aria-hidden={concealed || !awaitingUserGesture} aria-label={concealed ? undefined : 'YouTube 原生播放器'}>
    {awaitingUserGesture && !concealed && <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-black/70 px-3 py-2 text-center text-xs font-semibold text-white">請按 YouTube 原生播放鍵以啟動音訊</div>}
    <div ref={containerRef} />
  </div>;
}
