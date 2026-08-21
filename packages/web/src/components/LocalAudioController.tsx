import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';

type LocalAudioDetail = {
  audioUrl?: string;
  autoplay?: boolean;
};

const getDuration = (audio: HTMLAudioElement) => (
  Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined
);

export default function LocalAudioController() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.preload = 'auto';

    const setError = (message: string) => {
      usePlayerStore.getState().setLocalPlaybackError(message);
    };

    const playAudio = () => {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => setError('本機音檔無法播放，請確認瀏覽器允許播放或稍後再試。'));
      }
    };

    const loadAudio = (audioUrl: string, autoplay: boolean) => {
      if (!audioUrl) {
        setError('這首展示曲目沒有可用的音檔。');
        return;
      }
      if (audio.getAttribute('src') !== audioUrl) {
        audio.src = audioUrl;
        audio.load();
      }
      if (autoplay) playAudio();
    };

    const onLoad = (event: Event) => {
      const detail = (event as CustomEvent<LocalAudioDetail>).detail || {};
      loadAudio(detail.audioUrl || '', detail.autoplay === true);
    };
    const onPlay = () => playAudio();
    const onPause = () => audio.pause();
    const onSeek = (event: Event) => {
      const time = Number((event as CustomEvent<{ time?: number }>).detail?.time);
      if (Number.isFinite(time)) audio.currentTime = Math.max(0, time);
    };
    const onLoadedMetadata = () => {
      const duration = getDuration(audio);
      const snapshotTime = usePlayerStore.getState().currentTime;
      if (snapshotTime > 0 && audio.currentTime === 0 && duration) {
        audio.currentTime = Math.min(snapshotTime, duration);
      }
      usePlayerStore.getState().setLocalTime(audio.currentTime, duration);
    };
    const onTimeUpdate = () => {
      usePlayerStore.getState().setLocalTime(audio.currentTime, getDuration(audio));
    };
    const onPlayState = () => {
      usePlayerStore.getState().setLocalPlaybackState('playing', true);
    };
    const onPauseState = () => {
      if (!audio.ended) usePlayerStore.getState().setLocalPlaybackState('paused', false);
    };
    const onWaiting = () => {
      usePlayerStore.getState().setLocalPlaybackState('buffering', false);
    };
    const onEnded = () => {
      const store = usePlayerStore.getState();
      store.setLocalTime(getDuration(audio) || audio.currentTime, getDuration(audio));
      store.next();
    };
    const onError = () => setError('本機音檔載入失敗，請稍後重試或選擇其他展示曲目。');

    window.addEventListener('echora:local-load', onLoad);
    window.addEventListener('echora:local-play', onPlay);
    window.addEventListener('echora:local-pause', onPause);
    window.addEventListener('echora:local-seek', onSeek);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlayState);
    audio.addEventListener('pause', onPauseState);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      window.removeEventListener('echora:local-load', onLoad);
      window.removeEventListener('echora:local-play', onPlay);
      window.removeEventListener('echora:local-pause', onPause);
      window.removeEventListener('echora:local-seek', onSeek);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlayState);
      audio.removeEventListener('pause', onPauseState);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  const currentSong = usePlayerStore(state => state.currentSong);
  const volume = usePlayerStore(state => state.volume);
  const isMuted = usePlayerStore(state => state.isMuted);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentSong || currentSong.source !== 'local' || !currentSong.audioUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    if (audio.getAttribute('src') !== currentSong.audioUrl) {
      audio.src = currentSong.audioUrl;
      audio.load();
    }
  }, [currentSong?.audioUrl, currentSong?.id, currentSong?.source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : Math.min(1, Math.max(0, volume));
  }, [isMuted, volume]);

  return <audio ref={audioRef} preload="auto" className="hidden" aria-hidden="true" />;
}
