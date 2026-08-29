import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import packageJson from '../../package.json';
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, Sparkles } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { useTheme } from '../contexts/ThemeProvider';
import { usePlayer } from '../contexts/PlayerContext';
import { getAgnesApiStatus, generateAgnesTheme, type AgnesApiStatus } from '../services/agnesAi';
import type { ThemeConfig } from '@echora/core';
import type { MotionPreference } from '../store/themeStore';

export default function Settings() {
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
  const motionLabel: Record<MotionPreference, string> = { system: '依系統', on: '強制開啟', off: '允許動態' };
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
      setGenerationError('請先播放一首歌，再為它設計舞台。');
      return;
    }
    if (!aiThemeEnabled) {
      setGenerationError('請先開啟「允許 AI 動態生成主題」。');
      return;
    }
    if (agnesStatus !== 'configured') {
      setGenerationError('AI 主題服務尚未完成設定，請稍後再試。');
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
      setGenerationError(error instanceof Error ? error.message : 'AI 主題生成失敗，請稍後再試。');
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
    ? 'AI 主題服務已就緒'
    : agnesStatus === 'missing'
      ? 'AI 主題服務尚未設定'
      : '暫時無法確認 AI 主題服務狀態';

  return (
    <div className="settings-page min-h-screen bg-[#07090e] pb-8 font-sans text-white selection:bg-[#62f5c4] selection:text-black">
      <header className="sticky top-0 z-30 flex items-center border-b border-white/10 bg-[#0d111a]/90 px-4 py-3 backdrop-blur-2xl sm:px-6 sm:py-4">
        <button type="button" onClick={() => navigate('/app')} aria-label="返回探索頁" className="mr-4 rounded-2xl border border-white/10 p-2.5 text-white transition-all hover:bg-white/10 btn-spring">
          <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          <h1 className="font-heading text-lg font-extrabold text-white">Echora 設定</h1>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.85fr)] lg:items-start lg:p-8"><div className="space-y-8">
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">播放與外觀</h2>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 glass-card">
            <div>
              <p className="text-sm font-bold text-white">當前色彩風格</p>
              <p className="mt-0.5 text-xs text-slate-400">即時切換播放器與舞台的氛圍配色</p>
            </div>
            <button type="button" onClick={toggleTheme} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold text-[#62f5c4] transition-all hover:bg-white/20 btn-spring">
              {currentTheme.name}
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-extrabold tracking-wide text-slate-300">動態與無障礙</h2>
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 glass-card sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-white">減少動態效果</p>
              <p className="mt-0.5 text-xs text-slate-400">保持歌詞關鍵提示，並淡化背景漂移、輪播與循環光暈；目前：{effectiveReducedMotion ? '已降低動態' : '保留動態'}。</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-[#b8ffe2]">
              <span className="sr-only">減少動態效果偏好</span>
              <select value={motionPreference} onChange={(event) => setMotionPreference(event.target.value as MotionPreference)} aria-label="減少動態效果偏好" className="rounded-xl border border-white/10 bg-[#111720] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4]">
                <option value="system">依系統</option>
                <option value="on">強制開啟</option>
                <option value="off">允許動態</option>
              </select>
              <span className="sr-only">目前選擇：{motionLabel[motionPreference]}</span>
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <p className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#F9F871]">為這首歌生成舞台</p>
            <h2 className="mt-1 text-xl font-extrabold text-white">讓 Echora 為正在播放的歌設計舞台</h2>
          </div>
          <div className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 glass-card">
            {currentSong ? (
              <div className="rounded-2xl border border-[#62f5c4]/20 bg-[#62f5c4]/[0.06] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ff9d7]">正在設計</p>
                <p className="mt-1 text-base font-extrabold text-white">{currentSong.title}</p>
                <p className="mt-1 text-xs text-slate-400">{songArtist || '未知演出者'} · {lyricsText ? '會參考目前可用的歌詞與歌曲氛圍' : '將以歌曲資訊建立舞台氛圍'}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/15 p-4 text-center">
                <p className="font-bold text-white">先播放一首歌，再來設計它的舞台</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">你可以先用免登入展示曲目體驗，再決定是否連接自己的音樂。</p>
                <button type="button" onClick={() => navigate('/app?demo=1')} className="mt-3 rounded-xl border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-4 py-2 text-xs font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20">選一首展示曲目</button>
              </div>
            )}

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span><span className="block text-sm font-bold text-white">使用生成的舞台配色</span><span className="mt-0.5 block text-xs text-slate-400">由 AI 生成；一般播放不需要啟用。</span></span>
              <input type="checkbox" checked={aiThemeEnabled} onChange={(event) => { enableAiTheme(event.target.checked); setGenerationError(''); }} aria-label="允許 AI 動態生成主題" className="h-5 w-5 cursor-pointer rounded accent-[#62f5c4]" />
            </label>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">AI 主題服務</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">服務金鑰只在伺服器端使用，不會出現在瀏覽器、URL 或程式碼庫。</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-slate-300" role="status" aria-live="polite">
                  {agnesStatus === 'configured' ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-[#62f5c4]" /> : agnesStatus === 'missing' ? <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 text-amber-300" /> : <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                  <span>{agnesStatusLabel}</span>
                </div>
              </div>
              {agnesStatus !== 'configured' ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] leading-5 text-slate-400">{agnesStatus === 'missing' ? '請由部署管理者完成服務設定後重新部署。' : '請確認服務已部署，或稍後重試。'}</p><button type="button" onClick={() => void refreshAgnesStatus()} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10">重新檢查</button></div> : <p className="mt-3 text-[11px] leading-5 text-slate-400">提示只會包含目前歌曲的歌名、歌詞或純音樂狀態；不會送出私人歌單。</p>}
            </div>

            <button type="button" onClick={() => void handleGenerateTheme()} disabled={isGenerating || !aiThemeEnabled || agnesStatus !== 'configured' || !currentSong} className="w-full rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 py-3 text-xs font-extrabold text-black shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
              {isGenerating ? <><LoaderCircle aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 animate-spin align-[-3px]" />正在為這首歌設計舞台…</> : <><Sparkles aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />生成 AI 舞台預覽</>}
            </button>
            {generationError ? <p className="rounded-xl border border-rose-300/25 bg-rose-300/10 p-3 text-xs leading-5 text-rose-200" role="alert">{generationError}</p> : null}

            {generatedTheme ? (
              <div className="rounded-2xl border border-[#62f5c4]/30 bg-[#62f5c4]/[0.06] p-4" role="status">
                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-extrabold text-white">舞台預覽已準備好</p><p className="mt-1 text-xs text-slate-400">{generatedTheme.name} · 確認喜歡後再套用到 Stage。</p></div><div className="flex gap-1.5" aria-label="生成配色預覽"><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: generatedTheme.backgroundColor }} /><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: generatedTheme.primaryColor }} /><span className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: generatedTheme.accentColor }} /></div></div>
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={applyGeneratedTheme} className="rounded-xl bg-[#62f5c4] px-4 py-2 text-xs font-extrabold text-black transition hover:brightness-110">套用到 Stage</button><button type="button" onClick={() => setGeneratedTheme(null)} className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10">保留目前舞台</button></div>
              </div>
            ) : null}
          </div>
        </section>

        </div>
        <div className="space-y-8 lg:sticky lg:top-24">
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">關於 Echora Stage</h2>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
            <div><p className="font-bold text-white">Echora 隨身動態歌詞舞台</p><p className="mt-0.5 text-[11px] text-slate-500">Breathe with music · Motion Design System v2.0</p></div>
            <span className="rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/10 px-2.5 py-1 font-bold text-[#62f5c4]">v{packageJson.version}</span>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
