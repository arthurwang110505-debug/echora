import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeProvider';
import { usePlayer } from '../contexts/PlayerContext';
import { generateTheme, type AiProviderConfig, type ThemeConfig } from '@echora/core';
import type { MotionPreference } from '../store/themeStore';
import { clearDiagnosticEvents, createDiagnosticSummary, getDiagnosticLabel, readDiagnosticEvents, type DiagnosticEvent } from '../lib/diagnostics';

export default function Settings() {
  const navigate = useNavigate();
  const { currentTheme, setTheme, toggleTheme, enableAiTheme, aiThemeEnabled, motionPreference, setMotionPreference } = useTheme();
  const { currentSong, currentLyrics } = usePlayer();
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTheme, setGeneratedTheme] = useState<ThemeConfig | null>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEvent[]>([]);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [generationError, setGenerationError] = useState('');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateSystemPreference = () => setSystemReducedMotion(mediaQuery.matches);
    updateSystemPreference();
    mediaQuery.addEventListener?.('change', updateSystemPreference);
    setDiagnosticEvents(readDiagnosticEvents());
    return () => mediaQuery.removeEventListener?.('change', updateSystemPreference);
  }, []);

  const effectiveReducedMotion = motionPreference === 'on' || (motionPreference === 'system' && systemReducedMotion);
  const motionLabel: Record<MotionPreference, string> = { system: '依系統', on: '強制開啟', off: '允許動態' };
  const songArtist = currentSong?.artists.map(artist => artist.name).filter(Boolean).join('、') || '';
  const lyricsText = useMemo(() => currentLyrics?.lines
    .map(line => line.fullText || line.words.map(word => word.text).join(' '))
    .filter(Boolean)
    .join('\n') || '', [currentLyrics]);

  const handleGenerateTheme = async () => {
    if (!aiApiKey || !currentSong) return;

    setIsGenerating(true);
    setGenerationError('');
    setGeneratedTheme(null);
    try {
      const config: AiProviderConfig = { provider: aiProvider, apiKey: aiApiKey };
      const response = await generateTheme(config, {
        lyricsText: lyricsText || `No synchronized lyrics are available. Create a stage from the song title and artist: ${currentSong.title} ${songArtist}.`,
        isPureMusic: Boolean(currentSong.isPureMusic || !currentLyrics?.lines.length),
        songTitle: songArtist ? `${currentSong.title} — ${songArtist}` : currentSong.title,
      });
      if (response?.dark) setGeneratedTheme(response.dark as ThemeConfig);
    } catch (error) {
      console.error('Failed to generate stage theme:', error);
      setGenerationError(error instanceof Error ? error.message : '舞台暫時無法生成，請稍後再試。');
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

  const handleCopyDiagnostics = async () => {
    const summary = createDiagnosticSummary(diagnosticEvents);
    if (!summary) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(summary);
      setCopyFeedback('已複製不含敏感資料的診斷摘要。');
    } catch {
      setCopyFeedback('這個瀏覽器無法直接複製；請在支援剪貼簿權限的瀏覽器重試。');
    }
  };

  return (
    <div className="settings-page min-h-screen bg-[#07090e] pb-24 font-sans text-white selection:bg-[#62f5c4] selection:text-black">
      <header className="sticky top-0 z-30 flex items-center border-b border-white/10 bg-[#0d111a]/80 px-6 py-4 backdrop-blur-2xl">
        <button type="button" onClick={() => navigate('/')} aria-label="返回探索頁" className="mr-4 rounded-2xl border border-white/10 p-2.5 text-white transition-all hover:bg-white/10 btn-spring">
          <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-xs font-black text-black shadow-[0_0_12px_rgba(98,245,196,0.3)]">E</span>
          <h1 className="font-heading text-lg font-extrabold text-white">Echora 設定</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 p-6">
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
                <button type="button" onClick={() => navigate('/')} className="mt-3 rounded-xl border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-4 py-2 text-xs font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20">選一首展示曲目</button>
              </div>
            )}

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <span><span className="block text-sm font-bold text-white">使用生成的舞台配色</span><span className="mt-0.5 block text-xs text-slate-400">這是選用功能；一般播放不需要啟用。</span></span>
              <input type="checkbox" checked={aiThemeEnabled} onChange={(event) => enableAiTheme(event.target.checked)} className="h-5 w-5 cursor-pointer rounded accent-[#62f5c4]" />
            </label>

            <div>
              <label htmlFor="ai-api-key" className="mb-2 block text-xs font-medium text-slate-300">你的 AI 服務金鑰</label>
              <input id="ai-api-key" type="password" value={aiApiKey} onChange={(event) => { setAiApiKey(event.target.value); setGenerationError(''); }} placeholder="輸入你的金鑰…" autoComplete="off" aria-describedby="ai-key-privacy" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-[#62f5c4]" />
              <p id="ai-key-privacy" className="mt-2 text-[11px] leading-5 text-slate-500">金鑰只留在此頁面的記憶體中；生成時才會直接傳送給你選擇的服務商。Echora 不會代管金鑰，也不會把它寫入網址或診斷資料。</p>
              {aiApiKey ? <button type="button" onClick={() => setAiApiKey('')} className="mt-2 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10">清除目前金鑰</button> : null}
            </div>

            <label className="block text-xs font-medium text-slate-300">生成服務
              <select value={aiProvider} onChange={(event) => setAiProvider(event.target.value as 'gemini' | 'openai')} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111720] px-4 py-2.5 text-xs text-white outline-none focus:border-[#62f5c4]">
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>

            <button type="button" onClick={handleGenerateTheme} disabled={isGenerating || !aiApiKey || !currentSong} className="w-full rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 py-3 text-xs font-extrabold text-black shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
              {isGenerating ? '正在為這首歌設計舞台…' : <><Sparkles aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />生成舞台預覽</>}
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

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4"><h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">連線與隱私</h2><button type="button" onClick={() => { clearDiagnosticEvents(); setDiagnosticEvents([]); setCopyFeedback(''); }} disabled={!diagnosticEvents.length} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">清除紀錄</button></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-slate-300 glass-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-white">本機診斷紀錄</p><p className="mt-1 leading-5 text-slate-400">僅保留在這台裝置最近 30 筆播放與錯誤事件；不含帳號、token、歌名或歌詞，不會傳送至外部服務。</p></div>{diagnosticEvents.length ? <button type="button" onClick={() => void handleCopyDiagnostics()} className="rounded-lg border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-3 py-1.5 text-[11px] font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20">複製診斷摘要</button> : null}</div>{copyFeedback ? <p className="mt-3 text-[11px] text-[#b8ffe2]" role="status">{copyFeedback}</p> : null}{diagnosticEvents.length ? <ul className="mt-3 space-y-2">{diagnosticEvents.slice(0, 5).map(event => <li key={event.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2"><span className="text-[#b8ffe2]">{getDiagnosticLabel(event.name)}</span><time className="text-slate-500">{new Date(event.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></li>)}</ul> : <p className="mt-3 text-slate-500">目前沒有可顯示的本機診斷紀錄。</p>}</div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-widest text-[#62f5c4]">關於 Echora Stage</h2>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
            <div><p className="font-bold text-white">Echora 隨身動態歌詞舞台</p><p className="mt-0.5 text-[11px] text-slate-500">Breathe with music · Motion Design System v2.0</p></div>
            <span className="rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/10 px-2.5 py-1 font-bold text-[#62f5c4]">像 App 一樣使用</span>
          </div>
        </section>
      </main>
    </div>
  );
}
