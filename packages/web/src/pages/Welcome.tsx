import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Download, ListMusic, Mic2, MonitorSmartphone, Play, Sparkles } from 'lucide-react';
import { LOCAL_DEMO_SONGS } from '../store/localDemoSongs';
import { CoverImage } from '../components/LoadingSkeletons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const FEATURES = [
  {
    icon: Mic2,
    title: '動態歌詞舞台',
    description: '逐字同步的歌詞、AI 生成舞台配色與可調校的視覺模式，讓每一首歌都有專屬的呼吸舞台。',
  },
  {
    icon: ListMusic,
    title: '連接你的音樂',
    description: '支援 YouTube Music 私人歌單、Spotify（準備中）與免登入本機展示曲目，選歌後立即上台。',
  },
  {
    icon: MonitorSmartphone,
    title: '手機、iPad、電腦都能裝',
    description: '以 PWA 安裝到主畫面，之後每次開啟都直接進入歌單選擇，不需要先經過任何介紹頁。',
  },
] as const;

const PREVIEW_SONGS = LOCAL_DEMO_SONGS.slice(0, 4);

/** Landing "開始體驗" target: the demo experience inside the app shell. */
export const WELCOME_DEMO_TARGET = '/app?demo=1';
/** Low-key entrance for returning users who already know Echora. */
export const WELCOME_APP_TARGET = '/app';

export default function Welcome() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07090e] font-sans text-slate-100 selection:bg-[#62f5c4] selection:text-black">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-56 h-[32rem] w-[32rem] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-64 -right-32 h-[34rem] w-[34rem] rounded-full bg-indigo-600/10 blur-[130px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#07090e]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[76px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-lg font-black text-black shadow-[0_0_15px_rgba(98,245,196,0.3)]">E</span>
            <span>
              <span className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight text-white">ECHORA <span className="rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-wide text-[#62f5c4]">STAGE</span></span>
              <span className="hidden text-[10px] font-medium tracking-[0.16em] text-slate-500 sm:block">LYRICS / LIGHT / MOTION</span>
            </span>
          </div>
          {/* Low-key entrance for returning users; the main CTA below targets new visitors. */}
          <button
            type="button"
            onClick={() => navigate(WELCOME_APP_TARGET)}
            className="min-h-11 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-95 sm:text-sm"
          >
            開啟播放器
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1200px] px-5 pb-16 sm:px-8">
        <section className="relative grid min-h-[300px] overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#142e32] via-[#101922] to-[#111126] shadow-2xl sm:min-h-[360px] sm:rounded-[30px] lg:min-h-[420px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative z-10 flex flex-col justify-center p-6 sm:p-10 lg:p-14">
            <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#62f5c4] sm:mb-5 sm:px-3.5 sm:py-2 sm:text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#62f5c4] shadow-[0_0_10px_#62f5c4]" /> 免安裝、免登入，先聽再說
            </span>
            <h1 className="max-w-2xl font-heading text-[2.2rem] font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">
              讓每一首歌，<br />
              <span className="bg-gradient-to-r from-[#62f5c4] via-teal-200 to-white bg-clip-text text-transparent">都成為一座舞台。</span>
            </h1>
            <p className="mt-4 max-w-xl text-[13px] leading-6 text-slate-300/80 sm:mt-6 sm:text-base sm:leading-7">
              Echora 是一款沉浸式動態歌詞播放器：選一首展示曲目，立即體驗逐字歌詞、舞台視覺與播放控制。喜歡之後，再連接 YouTube Music 讀取自己的歌單。
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
              <button
                type="button"
                onClick={() => navigate(WELCOME_DEMO_TARGET)}
                className="rounded-xl bg-[#62f5c4] px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:scale-95 sm:text-base"
              >
                開始體驗 <ArrowRight aria-hidden="true" className="ml-2 inline-block h-4 w-4 align-[-3px]" />
              </button>
              {deferredPrompt && (
                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  className="rounded-xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-5 py-3 text-sm font-bold text-[#62f5c4] transition hover:bg-[#62f5c4]/20"
                >
                  <Download aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />加到主畫面
                </button>
              )}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-500">
              「開始體驗」會帶你進入展示歌單；已經是回訪使用者？上方「開啟播放器」直接進入歌單選擇。
            </p>
          </div>

          {/* Stage preview: a static, lightweight mock of the player experience. */}
          <div className="relative hidden min-h-[380px] overflow-hidden lg:block" aria-hidden="true">
            <div className="absolute right-[-8%] top-[12%] h-[430px] w-[430px] rounded-full bg-[#62f5c4]/20 blur-[90px]" />
            <div className="absolute right-[13%] top-[12%] w-[310px] rotate-12 rounded-[42px] border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-xl">
              {PREVIEW_SONGS[0] && (
                <>
                  <CoverImage src={PREVIEW_SONGS[0].coverUrl} alt="" wrapperClassName="h-[310px] w-full rounded-[32px]" className="h-full w-full rounded-[32px] object-cover opacity-90" />
                  <div className="absolute inset-x-7 bottom-7 rounded-2xl border border-white/15 bg-[#07090e]/75 p-3 backdrop-blur-xl">
                    <p className="text-xs font-bold text-white">{PREVIEW_SONGS[0].title}</p>
                    <p className="mt-1 text-[10px] text-[#62f5c4]">{typeof PREVIEW_SONGS[0].artists[0] === 'string' ? PREVIEW_SONGS[0].artists[0] : PREVIEW_SONGS[0].artists[0]?.name} · 本機音檔展示</p>
                  </div>
                </>
              )}
            </div>
            <div className="absolute bottom-[13%] left-[10%] flex items-end gap-1 opacity-70">
              {[30, 60, 42, 82, 55, 95, 45, 72, 35].map((height, index) => (
                <span key={index} className="w-1.5 rounded-full bg-[#62f5c4]" style={{ height }} />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-center text-[11px] font-bold tracking-wide text-slate-400 sm:text-xs" aria-label="Echora 使用流程">
          <span className="text-white">選歌</span><span aria-hidden="true" className="text-[#62f5c4]">→</span>
          <span>播放</span><span aria-hidden="true" className="text-[#62f5c4]">→</span>
          <span className="text-[#b8ffe2]">Stage</span>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Echora 功能特色">
          {FEATURES.map(feature => (
            <article key={feature.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-xl transition hover:border-[#62f5c4]/30">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 text-[#62f5c4]">
                <feature.icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-heading text-lg font-extrabold text-white">{feature.title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-10 overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#142e32] via-[#101922] to-[#111126] p-6 text-center shadow-2xl sm:p-10">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 text-[#62f5c4]"><Sparkles aria-hidden="true" className="h-5 w-5" /></span>
          <h2 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-white sm:text-3xl">準備好上台了嗎？</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-slate-400">不需要帳號，五首免版稅展示曲目已經就位。安裝到主畫面後，Echora 會直接從歌單選擇開始。</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(WELCOME_DEMO_TARGET)}
              className="rounded-xl bg-[#62f5c4] px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:scale-95"
            >
              <Play aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />開始體驗
            </button>
            {deferredPrompt && (
              <button
                type="button"
                onClick={() => void handleInstall()}
                className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <Download aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />加到主畫面
              </button>
            )}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.07] px-5 py-8 text-center sm:px-8">
        <p className="text-[11px] leading-5 text-slate-500">
          Echora · AGPL-3.0 開源專案，視覺技術來自 <a href="https://github.com/chthollyphile/folia-major" target="_blank" rel="noreferrer" className="font-bold text-slate-400 underline decoration-white/20 underline-offset-2 transition hover:text-[#62f5c4]">folia-major</a>。
        </p>
        <button type="button" onClick={() => navigate(WELCOME_APP_TARGET)} className="mt-3 min-h-11 rounded-xl px-3 text-xs font-bold text-slate-400 transition hover:text-[#62f5c4]">
          直接開啟播放器 →
        </button>
      </footer>
    </div>
  );
}
