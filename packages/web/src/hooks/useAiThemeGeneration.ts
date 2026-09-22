import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../store/playerStore';
import { useThemeStore } from '../store/themeStore';
import { getAgnesApiStatus, generateAgnesTheme, type AgnesApiStatus } from '../services/agnesAi';
import { sampleCoverPixels, themeFromPixels, themeFromSeed } from '../playback/coverTheme';
import type { AiThemeState } from '../components/player/panel/ControlsTab';

// src/hooks/useAiThemeGeneration.ts
// Per-song AI theme generation for the 播放控制 tab.
//
// The generated theme is cached per song (`ai:<source>:<id>`), which is what lets the tab show
// the filled Sparkles icon — and a clickable theme name — for songs that already have one.
// When the Agnes proxy is not configured, or the user has not opted into AI themes, generation
// falls back to cover colour extraction instead of failing, matching the documented behaviour.

export const songThemeKey = (song: { source: string; id: string } | null | undefined) => (
  song ? `ai:${song.source}:${song.id}` : ''
);

export function useAiThemeGeneration() {
  const { t } = useTranslation();
  const currentSong = usePlayerStore(state => state.currentSong);
  const currentLyrics = usePlayerStore(state => state.currentLyrics);
  const activeTheme = useThemeStore(state => state.activeTheme);
  const aiThemeEnabled = useThemeStore(state => state.aiThemeEnabled);
  const customThemes = useThemeStore(state => state.customThemes);

  const [agnesStatus, setAgnesStatus] = useState<AgnesApiStatus>('unavailable');
  const [state, setState] = useState<AiThemeState>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAgnesApiStatus()
      .then(status => { if (!cancelled) setAgnesStatus(status); })
      .catch(() => { if (!cancelled) setAgnesStatus('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  const key = songThemeKey(currentSong);
  const hasSongTheme = Boolean(key && customThemes[key]);
  // Without the AI opt-in we must not call the service; the offline cover fallback stays
  // available because it never leaves the browser.
  const canGenerate = Boolean(currentSong) && (aiThemeEnabled || agnesStatus !== 'configured');

  const lyricsText = (currentLyrics?.lines || [])
    .map(line => line.fullText || line.words.map(word => word.text).join(' '))
    .filter(Boolean)
    .join('\n');

  const generate = useCallback(async () => {
    const song = usePlayerStore.getState().currentSong;
    if (!song) return;
    const themeKey = songThemeKey(song);
    setState('generating');
    setError('');

    const artist = song.artists.map(a => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ');
    const themeName = artist ? `${song.title} — ${artist}` : song.title;

    try {
      let theme;
      if (agnesStatus === 'configured' && aiThemeEnabled) {
        const response = await generateAgnesTheme({
          lyricsText: lyricsText || `No synchronized lyrics are available. Create a stage from the song title and artist: ${themeName}`,
          isPureMusic: Boolean(song.isPureMusic || !currentLyrics?.lines.length),
          songTitle: themeName,
        });
        theme = { ...response[activeTheme], name: response[activeTheme].name || themeName };
      } else {
        // Documented fallback: derive the palette from the cover art.
        const pixels = await sampleCoverPixels(song.coverUrl || '');
        theme = pixels ? themeFromPixels(pixels, themeName) : themeFromSeed(themeKey, themeName);
      }

      useThemeStore.getState().saveCustomTheme(themeKey, theme);
      useThemeStore.getState().setTheme(theme);
      setState('idle');
    } catch (caught) {
      setState('error');
      setError(caught instanceof Error ? caught.message : t('panel.aiThemeError'));
    }
  }, [agnesStatus, aiThemeEnabled, activeTheme, lyricsText, currentLyrics, t]);

  return {
    state,
    error,
    agnesStatus,
    hasSongTheme,
    canGenerate,
    songThemeKey: key,
    generate: () => void generate(),
    refreshStatus: () => void getAgnesApiStatus().then(setAgnesStatus).catch(() => setAgnesStatus('unavailable')),
  };
}
