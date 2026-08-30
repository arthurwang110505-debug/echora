import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import packageJson from '../../package.json';
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, Sparkles } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { useTheme } from '../contexts/ThemeProvider';
import { usePlayer } from '../contexts/PlayerContext';
import { getAgnesApiStatus, generateAgnesTheme, type AgnesApiStatus } from '../services/agnesAi';
import type { ThemeConfig } from '@echora/core';
import type { MotionPreference } from '../store/themeStore';
import { getCorrespondingSourceUrl } from '../lib/sourceAvailability';
import { getLanguage, setLanguage, type AppLanguage } from '../i18n';

export default function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentTheme, activeTheme, setTheme, toggleTheme, enableAiTheme, aiThemeEnabled, motionPreference, setMotionPreference } = useTheme();
  const { currentSong, currentLyrics } = usePlayer();
  const [agnesStatus, setAgnesStatus] = useState<AgnesApiStatus>('unavailable');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTheme, setGeneratedTheme] = useState<ThemeConfig | null>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const refreshAgnesStatus = async () => {
    try {
      setAgnesStatus(await getAgnesApiStatus());
    } catch {
      setAgnesStatus('unavailable');
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateSystemPreference = () => setSystemReducedMotion(mediaQuery.matches);
    updateSystemPreference();
    mediaQuery.addEventListener?.('change', updateSystemPreference);
    void refreshAgnesStatus();
    return () => mediaQuery.removeEventListener?.('change', updateSystemPreference);
  }, []);

  const effectiveReducedMotion = motionPreference === 'on' || (motionPreference === 'system' && systemReducedMotion);
  const motionLabel: Record<MotionPreference, string> = {
    system: t('settings.motionSystem'),
    on: t('settings.motionOn'),
    off: t('settings.motionOff'),
  };
  const songArtist = currentSong?.artists.map(artist => artist.name).filter(Boolean).join('、') || '';
  const lyricsText = useMemo(() => currentLyrics?.lines
    .map(line => line.fullText || line.words.map(word => word.text).join(' '))
    .filter(Boolean)
    .join('\n') || '', [currentLyrics]);
  const isPureMusic = Boolean(currentSong?.isPureMusic || !currentLyrics?.lines.length);

  const handleGenerateTheme = async () => {
    setGenerationError('');
    setGeneratedTheme(null);
    if (!currentSong) {
      setGenerationError(t('settings.errorPlayFirst'));
      return;
    }
    if (!aiThemeEnabled) {
      setGenerationError(t('settings.errorEnableAi'));
      return;
    }
    if (agnesStatus !== 'configured') {
      setGenerationError(t('settings.errorServiceNotReady'));
      return;
    }

    setIsGenerating(true);
    try {
      const response = await generateAgnesTheme({
        lyricsText: lyricsText || `No synchronized lyrics are available. Create a stage from the song title and artist: ${currentSong.title} ${songArtist}`,
        isPureMusic,
        songTitle: songArtist ? `${currentSong.title} — ${songArtist}` : currentSong.title,
      });
      setGeneratedTheme(response[activeTheme]);
    } catch (error) {
      console.error('Failed to generate Agnes theme:', error);
      setGenerationError(error instanceof Error ? error.message : t('settings.errorGeneration'));
    } finally {
      setIsGenerating(false);
    }
  };

  const applyGeneratedTheme = () => {
    if (!generatedTheme) return;
    setTheme(generatedTheme);
    enableAiTheme(true);
    setGeneratedTheme(null);
  };

  const agnesStatusLabel = agnesStatus === 'configured'
    ? t('settings.agnesReady')
    : agnesStatus === 'missing'
      ? t('settings.agnesMissing')
      : t('settings.agnesUnknown');

  return (
    <div className="settings-page min-h-screen bg-[#07090e] pb-8 font-sans text-white selection:bg-[#62f5c4] selection:text-black">
      <header className="sticky top-0 z-30 flex items-center border-b border-white/10 bg-[#0d111a]/90 px-4 py-3 backdrop-blur-2xl sm:px-6 sm:py-4">
        <button type="button" onClick={() => navigate('/app')} aria-label={t('settings.back')} className="mr-4 rounded-2xl border border-white/10 p-2.5 text-white transition-all hover:bg-white/10 btn-spring">
          <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          <h1 className="font-heading text-lg font-extrabold text-white">{t('settings.title')}</h1>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.85fr)] lg:items-start lg:p-8"><div className="space-y-8">
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">{t('settings.language')}</h2>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 glass-card">
            <div>
              <p className="text-sm font-bold text-white">{t('settings.languageTitle')}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t('settings.languageHint')}</p>
            </div>
            <select
              value={getLanguage()}
              onChange={(event) => setLanguage(event.target.value as AppLanguage)}
              aria-label={t('settings.languageTitle')}
              className="rounded-xl border border-white/10 bg-[#111720] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4]"
            >
              <option value="zh-TW">{t('settings.languageZhTW')}</option>
              <option value="en">{t('settings.languageEn')}</option>
            </select>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">{t('settings.playbackAppearance')}</h2>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 glass-card">
            <div>
              <p className="text-sm font-bold text-white">{t('settings.currentTheme')}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t('settings.currentThemeHint')}</p>
            </div>
            <button type="button" onClick={toggleTheme} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold text-[#62f5c4] transition-all hover:bg-white/20 btn-spring">
              {currentTheme.name}
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-extrabold tracking-wide text-slate-300">{t('settings.motionAccessibility')}</h2>
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 glass-card sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-white">{t('settings.reduceMotion')}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t('settings.reduceMotionHint', { state: effectiveReducedMotion ? t('settings.motionReduced') : t('settings.motionKept') })}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-[#b8ffe2]">
              <span className="sr-only">{t('settings.reduceMotionPreference')}</span>
              <select value={motionPreference} onChange={(event) => setMotionPreference(event.target.value as MotionPreference)} aria-label={t('settings.reduceMotionPreference')} className="rounded-xl border border-white/10 bg-[#111720] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4]">
                <option value="system">{t('settings.motionSystem')}</option>
                <option value="on">{t('settings.motionOn')}</option>
                <option value="off">{t('settings.motionOff')}</option>
              </select>
              <span className="sr-only">{t('settings.currentSelection', { value: motionLabel[motionPreference] })}</span>
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <p className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#F9F871]">{t('settings.generateEyebrow')}</p>
            <h2 className="mt-1 text-xl font-extrabold text-white">{t('settings.generateHeading')}</h2>
          </div>
          <div className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 glass-card">
            {currentSong ? (
              <div className="rounded-2xl border border-[#62f5c4]/20 bg-[#62f5c4]/[0.06] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ff9d7]">{t('settings.designing')}</p>
                <p className="mt-1 text-base font-extrabold text-white">{currentSong.title}</p>
                <p className="mt-1 text-xs text-slate-400">{songArtist || t('settings.unknownArtist')} · {lyricsText ? t('settings.withLyricsContext') : t('settings.songInfoContext')}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/15 p-4 text-center">
                <p className="font-bold text-white">{t('settings.playFirstTitle')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{t('settings.playFirstHint')}</p>
                <button type="button" onClick={() => navigate('/app?demo=1')} className="mt-3 rounded-xl border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-4 py-2 text-xs font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20">{t('settings.pickShowcase')}</button>
              </div>
            )}

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span><span className="block text-sm font-bold text-white">{t('settings.useGeneratedColors')}</span><span className="mt-0.5 block text-xs text-slate-400">{t('settings.useGeneratedColorsHint')}</span></span>
              <input type="checkbox" checked={aiThemeEnabled} onChange={(event) => { enableAiTheme(event.target.checked); setGenerationError(''); }} aria-label={t('settings.allowAiTheme')} className="h-5 w-5 cursor-pointer rounded accent-[#62f5c4]" />
            </label>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{t('settings.aiService')}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{t('settings.aiServiceHint')}</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-slate-300" role="status" aria-live="polite">
                  {agnesStatus === 'configured' ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-[#62f5c4]" /> : agnesStatus === 'missing' ? <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 text-amber-300" /> : <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                  <span>{agnesStatusLabel}</span>
                </div>
              </div>
              {agnesStatus !== 'configured' ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] leading-5 text-slate-400">{agnesStatus === 'missing' ? t('settings.agnesMissingHint') : t('settings.agnesUnavailableHint')}</p><button type="button" onClick={() => void refreshAgnesStatus()} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10">{t('settings.recheck')}</button></div> : <p className="mt-3 text-[11px] leading-5 text-slate-400">{t('settings.agnesConfiguredHint')}</p>}
            </div>

            <button type="button" onClick={() => void handleGenerateTheme()} disabled={isGenerating || !aiThemeEnabled || agnesStatus !== 'configured' || !currentSong} className="w-full rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 py-3 text-xs font-extrabold text-black shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
              {isGenerating ? <><LoaderCircle aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 animate-spin align-[-3px]" />{t('settings.generating')}</> : <><Sparkles aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />{t('settings.generatePreview')}</>}
            </button>
            {generationError ? <p className="rounded-xl border border-rose-300/25 bg-rose-300/10 p-3 text-xs leading-5 text-rose-200" role="alert">{generationError}</p> : null}

            {generatedTheme ? (
              <div className="rounded-2xl border border-[#62f5c4]/30 bg-[#62f5c4]/[0.06] p-4" role="status">
                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-extrabold text-white">{t('settings.previewReady')}</p><p className="mt-1 text-xs text-slate-400">{t('settings.previewReadyHint', { name: generatedTheme.name })}</p></div><div className="flex gap-1.5" aria-label={t('settings.previewSwatches')}><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: generatedTheme.backgroundColor }} /><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: generatedTheme.primaryColor }} /><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: generatedTheme.accentColor }} /></div></div>
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={applyGeneratedTheme} className="rounded-xl bg-[#62f5c4] px-4 py-2 text-xs font-extrabold text-black transition hover:brightness-110">{t('settings.applyToStage')}</button><button type="button" onClick={() => setGeneratedTheme(null)} className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10">{t('settings.keepCurrentStage')}</button></div>
              </div>
            ) : null}
          </div>
        </section>

        </div>
        <div className="space-y-8 lg:sticky lg:top-24">
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">{t('settings.aboutTitle')}</h2>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
            <div><p className="font-bold text-white">{t('settings.aboutName')}</p><p className="mt-0.5 text-[11px] text-slate-500">Breathe with music · Motion Design System v2.0</p></div>
            <span className="rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/10 px-2.5 py-1 font-bold text-[#62f5c4]">v{packageJson.version}</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-slate-300">
            <p className="font-bold text-white">{t('settings.sourceCode')}</p>
            <p className="mt-1">{t('settings.sourceCodeHint')}</p>
            <a href={getCorrespondingSourceUrl()} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center font-bold text-[#62f5c4] underline decoration-white/20 underline-offset-2">{t('settings.openSource')}</a>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-slate-300">
            <p className="font-bold text-white">{t('settings.privacy')}</p>
            <p className="mt-1">{t('settings.privacyHint')}</p>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
