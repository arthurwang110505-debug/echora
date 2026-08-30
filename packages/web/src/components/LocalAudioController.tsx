import { useEffect, useRef } from 'react';
import i18n from '../i18n';
import { attachLocalAudioAnalyser, detachLocalAudioAnalyser, resumeLocalAudioAnalyser } from '../playback/localAudioAnalyser';
import { usePlayerStore } from '../store/playerStore';

const getDuration = (audio: HTMLAudioElement) => (
  Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined
);

export default function LocalAudioController() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localCommand = usePlayerStore(state => state.localCommand);
  const currentSong = usePlayerStore(state => state.currentSong);
  const volume = usePlayerStore(state => state.volume);
  const isMuted = usePlayerStore(state => state.isMuted);
  const isPlaying = usePlayerStore(state => state.isPlaying);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.preload = 'auto';
    attachLocalAudioAnalyser(audio);

    const setError = (message: string) => {
      usePlayerStore.getState().setLocalPlaybackError(message);
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
    const syncAudioState = () => {
      const store = usePlayerStore.getState();
      if (audio.ended) return;
      if (!audio.paused && !store.isPlaying) {
        store.setLocalPlaybackState('playing', true);
      }
    };
    const onError = () => setError(i18n.t('player.localLoadFailed'));

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlayState);
    audio.addEventListener('pause', onPauseState);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    document.addEventListener('visibilitychange', syncAudioState);
    window.addEventListener('pageshow', syncAudioState);
    syncAudioState();

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlayState);
      audio.removeEventListener('pause', onPauseState);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', syncAudioState);
      window.removeEventListener('pageshow', syncAudioState);
      detachLocalAudioAnalyser();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || localCommand.seq === 0) return;

    const playAudio = () => {
      const startPlayback = () => {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          void playPromise.then(() => {
            if (!audio.paused) usePlayerStore.getState().setLocalPlaybackState('playing', true);
          }).catch(() => usePlayerStore.getState().setLocalPlaybackError(i18n.t('player.localPlayUnavailable')));
        } else if (!audio.paused) {
          usePlayerStore.getState().setLocalPlaybackState('playing', true);
        }
      };
      void resumeLocalAudioAnalyser().then(startPlayback).catch(startPlayback);
    };

    if (localCommand.action === 'load') {
      const audioUrl = localCommand.url || '';
      if (!audioUrl) {
        usePlayerStore.getState().setLocalPlaybackError(i18n.t('player.localNoAudioFile'));
        return;
      }
      if (audio.getAttribute('src') !== audioUrl) {
        audio.src = audioUrl;
        audio.load();
      }
      if (localCommand.autoplay) playAudio();
      return;
    }
    if (localCommand.action === 'play') {
      playAudio();
      return;
    }
    if (localCommand.action === 'pause') {
      audio.pause();
      return;
    }
    if (localCommand.action === 'seek' && Number.isFinite(localCommand.time)) {
      audio.currentTime = Math.max(0, localCommand.time || 0);
    }
  }, [localCommand]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || currentSong?.source !== 'local' || audio.paused || audio.ended || isPlaying) return;
    usePlayerStore.getState().setLocalPlaybackState('playing', true);
  }, [currentSong?.audioUrl, currentSong?.id, currentSong?.source, isPlaying]);

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
