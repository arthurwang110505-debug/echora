import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeProvider';
import { generateTheme, type AiProviderConfig } from '@echora/core';
import { clearDiagnosticEvents, createDiagnosticSummary, getDiagnosticLabel, readDiagnosticEvents, type DiagnosticEvent } from '../lib/diagnostics';

export default function Settings() {
  const navigate = useNavigate();
  const { currentTheme, setTheme, toggleTheme, enableAiTheme, aiThemeEnabled } = useTheme();
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEvent[]>([]);
  const [copyFeedback, setCopyFeedback] = useState('');

  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(isReduced);
    setDiagnosticEvents(readDiagnosticEvents());
  }, []);

  const handleGenerateTheme = async () => {
    if (!aiApiKey) return;

    setIsGenerating(true);
    try {
      const config: AiProviderConfig = {
        provider: aiProvider,
        apiKey: aiApiKey,
      };
      const response = await generateTheme(config, {
        lyricsText: 'Demo lyrics for theme generation',
        isPureMusic: false,
        songTitle: 'Demo Song',
      });
      if (response && response.dark) {
        setTheme(response.dark as any);
        enableAiTheme(true);
      }
    } catch (error) {
      console.error('Failed to generate theme:', error);
    } finally {
      setIsGenerating(false);
    }
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
    <div className="settings-page min-h-screen bg-[#07090e] text-white pb-24 font-sans selection:bg-[#62f5c4] selection:text-black">
      <header className="flex items-center py-4 px-6 border-b border-white/10 bg-[#0d111a]/80 backdrop-blur-2xl sticky top-0 z-30">
        <button type="button" onClick={() => navigate('/')} aria-label="返回探索頁" className="mr-4 p-2.5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all btn-spring text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-xs font-black text-black shadow-[0_0_12px_rgba(98,245,196,0.3)]">E</span>
          <h1 className="text-lg font-extrabold font-heading text-white">Echora 設定</h1>
        </div>
      </header>

      <div className="p-6 max-w-2xl mx-auto space-y-8">
        <div className="setting-group space-y-3">
          <h3 className="text-xs font-extrabold text-[#62f5c4] uppercase tracking-widest font-mono">播放與外觀</h3>
          <div className="flex justify-between items-center p-4 bg-white/[0.04] rounded-2xl border border-white/10 glass-card">
            <div>
              <p className="text-sm font-bold text-white">當前色彩風格</p>
              <p className="text-xs text-slate-400 mt-0.5">即時切換播放器與動態流光氛圍配色</p>
            </div>
            <button onClick={toggleTheme} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all btn-spring text-xs font-bold text-[#62f5c4] border border-white/10">
              {currentTheme.name}
            </button>
          </div>
        </div>

        <div className="setting-group space-y-3">
          <h4 className="text-xs font-extrabold text-slate-300 tracking-wide">動態與無障礙</h4>
          <div className="flex justify-between items-center p-4 bg-white/[0.04] rounded-2xl border border-white/10 glass-card">
            <div>
              <p className="text-sm font-bold text-white">系統減少動態效果 (Reduced Motion)</p>
              <p className="text-xs text-slate-400 mt-0.5">保持歌詞關鍵提示，並自動淡化背景漂移與循環光暈</p>
            </div>
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border ${reducedMotion ? 'bg-[#62f5c4]/15 border-[#62f5c4]/30 text-[#62f5c4]' : 'bg-white/5 border-white/10 text-slate-400'}`}>
              {reducedMotion ? '已啟用' : '依系統預設'}
            </span>
          </div>
        </div>

        <div className="setting-group space-y-3">
          <h3 className="text-xs font-extrabold text-[#F9F871] uppercase tracking-widest font-mono">進階實驗功能</h3>
          <div className="flex justify-between items-center p-4 bg-white/[0.04] rounded-2xl border border-white/10 glass-card">
            <div>
              <p className="text-sm font-bold text-white">啟用 AI 動態生成主題</p>
              <p className="text-xs text-slate-400 mt-0.5">這是選用實驗功能；一般播放與外觀設定不需要啟用。</p>
            </div>
            <input
              type="checkbox"
              checked={aiThemeEnabled}
              onChange={(e) => enableAiTheme(e.target.checked)}
              className="w-5 h-5 accent-[#62f5c4] rounded cursor-pointer"
            />
          </div>
          <div className="p-5 bg-white/[0.03] rounded-3xl border border-white/10 space-y-4 glass-card">
            <div>
              <label className="text-xs text-slate-300 mb-2 block font-medium">AI API Key (Gemini / OpenAI)</label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="輸入您的 API 金鑰..."
                className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 focus:border-[#62f5c4] outline-none text-xs text-white"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-500">金鑰只保留在目前頁面的記憶體中，不會由 Echora 寫入本機儲存空間；按下生成時才會提供給你選擇的服務商。</p>
            </div>
            <div>
              <label className="text-xs text-slate-300 mb-2 block font-medium">AI 模型服務商</label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'openai')}
                className="w-full px-4 py-2.5 rounded-xl bg-[#111720] border border-white/10 focus:border-[#62f5c4] outline-none text-xs text-white"
              >
                <option value="gemini">Google Gemini AI</option>
                <option value="openai">OpenAI GPT-4</option>
              </select>
            </div>
            <button
              onClick={handleGenerateTheme}
              disabled={isGenerating || !aiApiKey}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-extrabold text-black text-xs shadow-lg active:scale-95"
            >
              {isGenerating ? '生成主題中...' : '✨ 依據歌詞生成專屬主題'}
            </button>
          </div>
        </div>

        <div className="setting-group space-y-3">
          <div className="flex items-center justify-between gap-4"><h3 className="text-xs font-extrabold text-[#62f5c4] uppercase tracking-widest font-mono">連線與隱私</h3><button type="button" onClick={() => { clearDiagnosticEvents(); setDiagnosticEvents([]); setCopyFeedback(''); }} disabled={!diagnosticEvents.length} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">清除紀錄</button></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-slate-300 glass-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-white">本機診斷紀錄</p><p className="mt-1 leading-5 text-slate-400">僅保留在這台裝置最近 30 筆播放與錯誤事件；不含帳號、token、歌名或歌詞，不會傳送至外部服務。</p></div>{diagnosticEvents.length ? <button type="button" onClick={() => void handleCopyDiagnostics()} className="rounded-lg border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-3 py-1.5 text-[11px] font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20">複製診斷摘要</button> : null}</div>{copyFeedback ? <p className="mt-3 text-[11px] text-[#b8ffe2]" role="status">{copyFeedback}</p> : null}{diagnosticEvents.length ? <ul className="mt-3 space-y-2">{diagnosticEvents.slice(0, 5).map(event => <li key={event.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2"><span className="text-[#b8ffe2]">{getDiagnosticLabel(event.name)}</span><time className="text-slate-500">{new Date(event.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></li>)}</ul> : <p className="mt-3 text-slate-500">目前沒有可顯示的本機診斷紀錄。</p>}</div>
        </div>

        <div className="setting-group space-y-3">
          <h3 className="text-xs font-extrabold text-[#62f5c4] uppercase tracking-widest font-mono">關於 Echora Stage</h3>
          <div className="p-4 bg-white/[0.04] rounded-2xl border border-white/10 flex justify-between items-center text-xs">
            <div>
              <p className="font-bold text-white">Echora 隨身動態歌詞舞台</p>
              <p className="text-slate-500 text-[11px] mt-0.5">Breathe with music · Motion Design System v2.0</p>
            </div>
            <span className="text-[#62f5c4] font-mono font-bold bg-[#62f5c4]/10 border border-[#62f5c4]/20 px-2.5 py-1 rounded-xl">v1.2.0 PWA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
