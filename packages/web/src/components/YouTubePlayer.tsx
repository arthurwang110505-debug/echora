import { useEffect, useRef } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { extractYouTubeVideoId } from '@echora/core';

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void; } }

export default function YouTubePlayer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const { currentSong, isPlaying, volume } = usePlayer();

  useEffect(() => {
    if (currentSong?.source !== 'ytmusic') return;
    const create = () => {
      if (!hostRef.current || !window.YT?.Player || playerRef.current) return;
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
              usePlayer.setState({ isPlaying: false, currentTime: 0, youtubeError: null });
            }
          },
          onStateChange: (event: any) => {
            const state = usePlayer.getState();
            const duration = Number(event.target.getDuration?.() || state.duration);
            const currentTime = Number(event.target.getCurrentTime?.() || 0);
            if (event.data === window.YT.PlayerState.PLAYING) usePlayer.setState({ isPlaying: true, currentTime, duration, youtubeError: null });
            if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.CUED || event.data === window.YT.PlayerState.ENDED) usePlayer.setState({ isPlaying: false, currentTime, duration });
          },
          onError: (event: any) => {
            const messages: Record<number, string> = {
              2: 'YouTube 拒絕了這支影片的播放參數。',
              5: '此影片無法由 HTML5 播放器播放。',
              100: '此影片已不存在或設為私人。',
              101: '影片擁有者禁止在其他網站嵌入播放。',
              150: '影片擁有者禁止在其他網站嵌入播放。',
            };
            usePlayer.setState({ isPlaying: false, youtubeError: messages[event.data] || 'YouTube 無法播放此影片。' });
          },
        },
      });
    };
    if (window.YT?.Player) create();
    else { window.onYouTubeIframeAPIReady = create; const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.appendChild(script); }
    return () => { window.onYouTubeIframeAPIReady = undefined; };
  }, [currentSong?.source]);

  useEffect(() => {
    const onLoad = (event: Event) => {
      const videoId = extractYouTubeVideoId((event as CustomEvent).detail.videoId);
      if (!videoId) {
        usePlayer.setState({ isPlaying: false, youtubeError: '缺少有效的 YouTube video ID。' });
        return;
      }
      if (typeof playerRef.current?.loadVideoById === 'function') playerRef.current.loadVideoById(videoId);
    };
    const onPlay = () => { if (typeof playerRef.current?.playVideo === 'function') playerRef.current.playVideo(); };
    const onPause = () => { if (typeof playerRef.current?.pauseVideo === 'function') playerRef.current.pauseVideo(); };
    const onSeek = (event: Event) => { if (typeof playerRef.current?.seekTo === 'function') playerRef.current.seekTo((event as CustomEvent<number>).detail, true); };
    window.addEventListener('echora:youtube-load', onLoad); window.addEventListener('echora:youtube-play', onPlay); window.addEventListener('echora:youtube-pause', onPause); window.addEventListener('echora:youtube-seek', onSeek);
    return () => { window.removeEventListener('echora:youtube-load', onLoad); window.removeEventListener('echora:youtube-play', onPlay); window.removeEventListener('echora:youtube-pause', onPause); window.removeEventListener('echora:youtube-seek', onSeek); };
  }, []);

  useEffect(() => {
    if (typeof playerRef.current?.setVolume === 'function') playerRef.current.setVolume(Math.round((volume || 0) * 100));
  }, [volume]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (typeof playerRef.current?.getCurrentTime !== 'function' || currentSong?.source !== 'ytmusic') return;
      const state = usePlayer.getState();
      if (!state.isPlaying) return;
      const currentTime = Number(playerRef.current.getCurrentTime() || 0);
      const duration = Number(playerRef.current.getDuration?.() || state.duration);
      if (Math.abs(currentTime - state.currentTime) > 0.25) usePlayer.setState({ currentTime, duration });
    }, 250);
    return () => window.clearInterval(timer);
  }, [currentSong]);

  // The official IFrame Player API requires a rendered viewport of at least 200×200px.
  // Keep its native play surface visible until the user starts audio so browsers can preserve the gesture.
  const awaitingUserGesture = currentSong?.source === 'ytmusic' && !isPlaying;
  return <div className={awaitingUserGesture
    ? 'fixed bottom-5 right-5 z-50 w-[356px] overflow-hidden rounded-2xl border border-[#62f5c4]/45 bg-black shadow-2xl'
    : 'pointer-events-none fixed -left-[10000px] top-0 h-[200px] w-[356px] overflow-hidden'} aria-label="YouTube 播放器">
    {awaitingUserGesture && <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-black/70 px-3 py-2 text-center text-xs font-semibold text-white">請在這個 YouTube 播放器按下原生播放鍵以啟動音訊</div>}
    <div ref={hostRef} />
  </div>;
}
