import { useEffect, useRef } from 'react';
import { usePlayer } from '../contexts/PlayerContext';

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void; } }

export default function YouTubePlayer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const { currentSong, isPlaying, volume, setVolume, youtubeConnected, displayMode } = usePlayer();

  useEffect(() => {
    if (!youtubeConnected) return;
    const create = () => {
      if (!hostRef.current || !window.YT?.Player || playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, { width: '320', height: '180', videoId: currentSong?.source === 'ytmusic' ? currentSong.audioUrl || currentSong.id : undefined, playerVars: { playsinline: 1, origin: window.location.origin }, events: { onReady: (event: any) => event.target.setVolume(volume * 100) } });
    };
    if (window.YT?.Player) create();
    else { window.onYouTubeIframeAPIReady = create; const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.appendChild(script); }
    return () => { window.onYouTubeIframeAPIReady = undefined; };
  }, [youtubeConnected]);

  useEffect(() => {
    const onLoad = (event: Event) => { const videoId = (event as CustomEvent).detail.videoId; playerRef.current?.loadVideoById(videoId); };
    const onPlay = () => playerRef.current?.playVideo();
    const onPause = () => playerRef.current?.pauseVideo();
    const onSeek = (event: Event) => playerRef.current?.seekTo((event as CustomEvent<number>).detail, true);
    window.addEventListener('echora:youtube-load', onLoad); window.addEventListener('echora:youtube-play', onPlay); window.addEventListener('echora:youtube-pause', onPause); window.addEventListener('echora:youtube-seek', onSeek);
    return () => { window.removeEventListener('echora:youtube-load', onLoad); window.removeEventListener('echora:youtube-play', onPlay); window.removeEventListener('echora:youtube-pause', onPause); window.removeEventListener('echora:youtube-seek', onSeek); };
  }, []);

  useEffect(() => { playerRef.current?.setVolume((volume || 0) * 100); }, [volume]);
  useEffect(() => { if (!playerRef.current || currentSong?.source !== 'ytmusic') return; if (isPlaying) playerRef.current.playVideo(); else playerRef.current.pauseVideo(); }, [currentSong, isPlaying]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (playerRef.current?.getCurrentTime && currentSong?.source === 'ytmusic') { const time = playerRef.current.getCurrentTime(); window.dispatchEvent(new CustomEvent('echora:youtube-time', { detail: time })); } }, 100);
    return () => window.clearInterval(timer);
  }, [currentSong]);

  useEffect(() => { const onTime = (event: Event) => { const time = (event as CustomEvent<number>).detail; if (Math.abs(time - usePlayer.getState().currentTime) > 0.25) usePlayer.setState({ currentTime: time }); }; window.addEventListener('echora:youtube-time', onTime); return () => window.removeEventListener('echora:youtube-time', onTime); }, []);

  return <div className={`${displayMode === 'stage' ? 'fixed bottom-0 left-0 h-px w-px opacity-0 pointer-events-none' : 'absolute bottom-20 right-4'} z-30 overflow-hidden rounded-xl border border-white/10 bg-black/50 shadow-2xl transition-opacity`} aria-label="YouTube 播放器"><div ref={hostRef} /><button type="button" onClick={() => setVolume(volume > 0 ? 0 : 0.8)} className="absolute inset-0 rounded bg-black/60 px-2 py-1 text-xs text-white">{volume > 0 ? '🔊' : '🔇'}</button></div>;
}
