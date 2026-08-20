import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeProvider';
import { generateTheme, type AiProviderConfig } from '@echora/core';

export default function Settings() {
  const navigate = useNavigate();
  const { currentTheme, setTheme, toggleTheme, enableAiTheme, aiThemeEnabled } = useTheme();
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(isReduced);
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
          <h3 className="text-xs font-extrabold text-[#62f5c4] uppercase tracking-widest font-mono">外觀與舞台主題</h3>
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
          <h3 className="text-xs font-extrabold text-[#62f5c4] uppercase tracking-widest font-mono">動態與無障礙 (Accessibility)</h3>
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
          <h3 className="text-xs font-extrabold text-[#62f5c4] uppercase tracking-widest font-mono">AI 主題自動生成</h3>
          <div className="flex justify-between items-center p-4 bg-white/[0.04] rounded-2xl border border-white/10 glass-card">
            <div>
              <p className="text-sm font-bold text-white">啟用 AI 動態生成主題</p>
              <p className="text-xs text-slate-400 mt-0.5">根據歌曲歌詞意境與情緒，即時客製化專屬調色盤</p>
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
