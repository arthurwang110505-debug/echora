import { useNavigate } from 'react-router-dom';

export default function Library() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#07090e] text-white pb-24 font-sans selection:bg-[#62f5c4] selection:text-black">
      <header className="flex items-center py-4 px-6 border-b border-white/10 bg-[#0d111a]/80 backdrop-blur-2xl sticky top-0 z-30">
        <button
          onClick={() => navigate('/')}
          className="mr-4 p-2.5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all btn-spring text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-xs font-black text-black shadow-[0_0_12px_rgba(98,245,196,0.3)]">E</span>
          <h1 className="text-lg font-extrabold font-heading text-white">我的音樂庫</h1>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center py-28 px-6 text-center max-w-md mx-auto space-y-4">
        <div className="w-20 h-20 rounded-3xl bg-[#62f5c4]/10 border border-[#62f5c4]/30 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(98,245,196,0.15)] animate-pulse">
          🎧
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold font-heading text-white">本地音樂庫與已儲存歌單</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            在此管理你匯入的音訊檔案，或連線至 Spotify / YouTube Music 即時同步雲端播放清單。
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="mt-2 px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-slate-200 transition-all btn-spring"
        >
          返回探索熱門曲目 →
        </button>
      </div>
    </div>
  );
}

