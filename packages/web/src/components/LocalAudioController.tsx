import { useCallback, useEffect, useRef } from 'react';
import i18n from '../i18n';
import {
  attachLocalAudioAnalyser,
  detachLocalAudioAnalyser,
  getLocalAnalyserHealth,
  resumeLocalAudioAnalyser,
} from '../playback/localAudioAnalyser';
import {
  createCorsProbeCache,
  getPageOrigin,
  probeAudioCorsSupport,
  resolveAudioRouting,
  type AudioRoutingDecision,
} from '../playback/audioRouting';
import { derivePlaybackVolume } from '../playback/volumeState';
import { recordDiagnostic } from '../lib/diagnostics';
import { usePlayerStore } from '../store/playerStore';

const getDuration = (audio: HTMLAudioElement) => (
  Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined
);

const directDecision = (reason: AudioRoutingDecision['reason']): AudioRoutingDecision => ({
  mode: 'direct',
  crossOrigin: null,
  reason,
  requiresProbe: false,
});

/**
 * Owns the <audio> element and decides, before every `src` assignment, whether the
 * element may be routed through the Web Audio analyser.
 *
 * Order matters: a cross-origin media element that was fetched without
 * `crossorigin="anonymous"` is CORS-tainted, and a tainted element that is claimed by
 * `createMediaElementSource()` must output silence - the player keeps running while the
 * room stays quiet. Anything we cannot prove readable is therefore left on native
 * output, where the stage falls back to its synthetic pulse instead of losing sound.
 */
export default function LocalAudioController() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadTokenRef = useRef(0);
  const routingRef = useRef<AudioRoutingDecision | null>(null);
  const configuredSrcRef = useRef<string | null>(null);
  /** URLs whose CORS-mode load already failed once; they stay on native output. */
  const corsRejectedRef = useRef(new Set<string>());
  const localCommand = usePlayerStore(state => state.localCommand);
  const currentSong = usePlayerStore(state => state.currentSong);
  const volume = usePlayerStore(state => state.volume);
  const isMuted = usePlayerStore(state => state.isMuted);
  const isPlaying = usePlayerStore(state => state.isPlaying);

  // Memoized per origin so a playlist on one CDN only ever pays for one probe.
  const probeRef = useRef(createCorsProbeCache((url: string) => (
    probeAudioCorsSupport(url, typeof fetch === 'function' ? fetch : null)
  )));

  const applyRouting = useCallback((audio: HTMLAudioElement, decision: AudioRoutingDecision) => {
    routingRef.current = decision;
    audio.crossOrigin = decision.crossOrigin;
    usePlayerStore.getState().setLocalSpectrum({ mode: decision.mode, reason: decision.reason });
    if (decision.mode === 'analyser') {
      const attach = attachLocalAudioAnalyser(audio);
      if (!attach.routed) {
        // Web Audio unavailable or the element is already owned elsewhere: the element
        // stays on native output, so drop the CORS opt-in too - it only adds load risk
        // once nothing is being measured. Only the spectrum degrades, never the audio.
        audio.crossOrigin = null;
        routingRef.current = directDecision(attach.reason === 'claimed' ? 'cors-probe-failed' : 'invalid-url');
        usePlayerStore.getState().setLocalSpectrum({ mode: 'direct', reason: attach.reason });
      }
    }
    recordDiagnostic('audio_routing', { mode: routingRef.current.mode, reason: routingRef.current.reason });
  }, []);

  const configureSource = useCallback(async (audioUrl: string, allowProbe = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = ++loadTokenRef.current;
    const pageOrigin = getPageOrigin();
    const failedBefore = corsRejectedRef.current.has(audioUrl);
    let decision = resolveAudioRouting(audioUrl, pageOrigin);

    if (failedBefore) {
      // A URL that already failed once in CORS mode never retries it: keep it on native
      // output (audible, no live spectrum) instead of looping through the same failure.
      decision = directDecision('cors-probe-failed');
    } else if (decision.requiresProbe) {
      if (!allowProbe) {
        decision = directDecision('cors-probe-failed');
      } else {
        const probed = await probeRef.current(audioUrl, pageOrigin);
        decision = probed
          ? { ...decision, requiresProbe: false, reason: 'cors-probe-ok' }
          : directDecision('cors-probe-failed');
      }
    }
    if (token !== loadTokenRef.current) return;

    if (decision.mode === 'analyser' || decision.crossOrigin) {
      applyRouting(audio, decision);
    } else {
      // Keep the decision but never attach: the element must stay on native output.
      routingRef.current = decision;
      audio.crossOrigin = null;
      usePlayerStore.getState().setLocalSpectrum({ mode: decision.mode, reason: decision.reason });
      recordDiagnostic('audio_routing', { mode: decision.mode, reason: decision.reason });
    }

    if (configuredSrcRef.current !== audioUrl) {
      configuredSrcRef.current = audioUrl;
      audio.src = audioUrl;
      audio.load();
    }
  }, [applyRouting]);

  /**
   * A host can advertise CORS on `HEAD` and still reject the media fetch (signed URLs,
   * credential rules). Retry that URL once without `crossorigin`, and only then surface
   * the load error, so a flaky host degrades to "no live spectrum" instead of silence.
   */
  const handleLoadError = useCallback((audio: HTMLAudioElement) => {
    const url = configuredSrcRef.current;
    const tainted = Boolean(routingRef.current?.crossOrigin);
    if (url && tainted && !corsRejectedRef.current.has(url)) {
      corsRejectedRef.current.add(url);
      // Force a real reload: `configureSource` skips `audio.src` when it believes the
      // element already points at this URL, and this retry must re-fetch without CORS.
      configuredSrcRef.current = null;
      void configureSource(url, false).then(() => {
        const store = usePlayerStore.getState();
        if (store.isPlaying) {
          audio.play().catch(() => store.setLocalPlaybackError(i18n.t('player.localPlayUnavailable')));
        }
      });
      return;
    }
    usePlayerStore.getState().setLocalPlaybackError(i18n.t('player.localLoadFailed'));
  }, [configureSource]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.preload = 'auto';

    // Dev-only console hook: `__echoraAnalyserHealth()` answers "why is there no sound?"
    // with the routing decision, the AudioContext state and the element's own flags.
    if (import.meta.env.DEV) {
      const host = window as unknown as { __echoraAnalyserHealth?: () => unknown };
      host.__echoraAnalyserHealth = () => ({
        ...getLocalAnalyserHealth(),
        routing: routingRef.current,
        element: {
          src: audio.currentSrc || audio.src,
          crossOrigin: audio.crossOrigin,
          volume: audio.volume,
          muted: audio.muted,
          paused: audio.paused,
          readyState: audio.readyState,
          error: audio.error?.code ?? null,
        },
      });
    }

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
      void resumeLocalAudioAnalyser();
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
    const onError = () => handleLoadError(audio);
    const syncAudioState = () => {
      const store = usePlayerStore.getState();
      if (audio.ended) return;
      // Browsers keep a "playing" element silent while the AudioContext is parked after a
      // tab switch or an iOS interruption, so resuming here is what unblocks the stage.
      void resumeLocalAudioAnalyser();
      if (!store.isPlaying && !audio.paused) store.setLocalPlaybackState('playing', true);
    };

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
      // Sampling stops; the analyser graph and the element claim survive on purpose, so a
      // StrictMode remount can never strand the element on a closed context.
      detachLocalAudioAnalyser();
      audio.pause();
      if (import.meta.env.DEV) delete (window as unknown as { __echoraAnalyserHealth?: unknown }).__echoraAnalyserHealth;
    };
  }, [configureSource, handleLoadError]);

  // Web Audio may only start from a user gesture, and iOS parks the context in
  // 'interrupted' after a call or the ring switch: unlock on the first interaction.
  useEffect(() => {
    const unlock = () => { void resumeLocalAudioAnalyser(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
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
      // Load order is deliberate: routing first, then `src`, then play.
      void configureSource(audioUrl)
        .catch(() => {
          configuredSrcRef.current = audioUrl;
          audio.src = audioUrl;
          audio.load();
        })
        .finally(() => {
          if (localCommand.autoplay) playAudio();
        });
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
      void resumeLocalAudioAnalyser();
      audio.currentTime = Math.max(0, localCommand.time || 0);
    }
  }, [configureSource, localCommand]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || currentSong?.source !== 'local' || audio.paused || audio.ended || isPlaying) return;
    // Never claim "playing" from the element alone: with a blocked context the element
    // really does run while the graph outputs nothing, and that is exactly the state a
    // silent stage hides behind.
    if (audio.readyState >= 2 || getLocalAnalyserHealth().contextState === 'running') {
      usePlayerStore.getState().setLocalPlaybackState('playing', true);
    }
  }, [currentSong?.audioUrl, currentSong?.id, currentSong?.source, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentSong || currentSong.source !== 'local' || !currentSong.audioUrl) {
      loadTokenRef.current += 1;
      configuredSrcRef.current = null;
      routingRef.current = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    if (configuredSrcRef.current === currentSong.audioUrl) return;
    void configureSource(currentSong.audioUrl);
  }, [configureSource, currentSong?.audioUrl, currentSong?.id, currentSong?.source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = derivePlaybackVolume(volume, isMuted);
  }, [isMuted, volume]);

  return <audio ref={audioRef} preload="auto" className="hidden" aria-hidden="true" />;
}
