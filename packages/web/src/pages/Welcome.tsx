import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MotionConfig, motion, useScroll } from 'framer-motion';
import { ArrowRight, Download, ListMusic, Mic2, MonitorSmartphone, Play, Radio, Sparkles } from 'lucide-react';
import { LOCAL_DEMO_SONGS } from '../store/localDemoSongs';
import { CoverImage } from '../components/LoadingSkeletons';
import StageLightCanvas from '../components/landing/StageLightCanvas';
import KaraokeLine from '../components/landing/KaraokeLine';
import TiltCard from '../components/landing/TiltCard';
import MagneticButton from '../components/landing/MagneticButton';
import Reveal from '../components/landing/Reveal';
import '../styles/landing.css';

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

/** Folia visualizer mode names — also the landing marquee strip. */
const STAGE_MODES = ['Luminous', 'Fume', 'Monet', '镜台', '云阶', 'Pendolo', '商籁', 'Tilt', 'Mindscape', 'Cappella', 'Claddagh'];

/** The big stage-demo section cycles these scenes in sync with the lyrics. */
const DEMO_SCENES = [
  { line: '燈光為這句歌詞亮起', mode: 'Luminous', bg: 'radial-gradient(120% 90% at 50% 110%, rgba(98,245,196,0.16), transparent 62%)', accent: 'rgba(98, 245, 196, 0.6)' },
  { line: '每個字，都落在節拍上', mode: 'Fume', bg: 'radial-gradient(120% 90% at 50% 110%, rgba(129,140,248,0.18), transparent 62%)', accent: 'rgba(165, 180, 252, 0.62)' },
  { line: '副歌一起，舞台開始呼吸', mode: 'Monet', bg: 'radial-gradient(120% 90% at 50% 110%, rgba(167,139,250,0.17), transparent 62%)', accent: 'rgba(196, 181, 253, 0.62)' },
] as const;

const HERO_KARAOKE_LINES = ['燈光為這一句亮起', '每個字都踩在節拍上', '整座舞台隨旋律呼吸'];

/** Landing "開始體驗" target: the demo experience inside the app shell. */
export const WELCOME_DEMO_TARGET = '/app?demo=1';
/** Low-key entrance for returning users who already know Echora. */
export const WELCOME_APP_TARGET = '/app';

export default function Welcome() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { scrollYProgress } = useScroll();
  const [demoScene, setDemoScene] = useState(0);
  const handleDemoSceneChange = useCallback((index: number) => setDemoScene(index), []);

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

  const activeScene = DEMO_SCENES[demoScene] ?? DEMO_SCENES[0];

  return (
    <MotionConfig reducedMotion="user">
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
          {/* Reading progress: a thin stage-light bar riding the header edge. */}
          <motion.div
            aria-hidden="true"
            style={{ scaleX: scrollYProgress }}
            className="absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-gradient-to-r from-[#62f5c4] via-teal-300 to-indigo-400"
          />
        </header>

        <main className="relative z-10 mx-auto max-w-[1200px] px-5 pb-16 sm:px-8">
          {/* ---------------- Hero: live stage light show ---------------- */}
          <section className="relative mt-5 overflow-hidden rounded-[26px] border border-white/10 shadow-2xl sm:mt-7 sm:rounded-[30px]">
            <div className="absolute inset-0" aria-hidden="true">
              <StageLightCanvas className="h-full w-full" />
              <div className="stage-aurora stage-aurora-1 absolute -left-24 top-6 h-72 w-72 rounded-full bg-emerald-400/20" />
              <div className="stage-aurora stage-aurora-2 absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-indigo-500/20" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07090e]/90 via-[#07090e]/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#07090e] to-transparent" />
            </div>

            <div className="relative z-10 grid min-h-[560px] lg:min-h-[520px] lg:grid-cols-[1.05fr_0.95fr]">
              <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
                <Reveal y={16}>
                  <span className="mb-3 inline-flex items-center gap-2.5 rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3.5 py-2 text-[10px] font-bold tracking-wide text-[#62f5c4] sm:mb-5 sm:text-[11px]">
                    <span className="stage-eq flex h-4 items-end gap-[3px]" aria-hidden="true">
                      <span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" />
                    </span>
                    免安裝、免登入，先聽再說
                  </span>
                </Reveal>

                <Reveal delay={0.08} y={22}>
                  <h1 className="max-w-2xl font-heading text-[2.2rem] font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">
                    讓每一首歌，<br />
                    <span className="stage-headline-accent">都成為一座舞台。</span>
                  </h1>
                </Reveal>

                <Reveal delay={0.16} y={20}>
                  <p className="mt-4 max-w-xl text-[13px] leading-6 text-slate-300/80 sm:mt-6 sm:text-base sm:leading-7">
                    Echora 是一款沉浸式動態歌詞播放器：選一首展示曲目，立即體驗逐字歌詞、舞台視覺與播放控制。喜歡之後，再連接 YouTube Music 讀取自己的歌單。
                  </p>
                </Reveal>

                {/* Live lyric preview: the same word-fill behaviour as the player stage. */}
                <Reveal delay={0.22} y={18}>
                  <div className="mt-5 flex max-w-md items-center gap-4 rounded-2xl border border-white/10 bg-[#07090e]/55 px-4 py-3.5 backdrop-blur-md sm:mt-7">
                    <span className="flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#62f5c4]">
                      <Radio aria-hidden="true" className="h-3 w-3" /> PREVIEW
                    </span>
                    <KaraokeLine lines={HERO_KARAOKE_LINES} className="min-w-0 truncate font-heading text-base font-bold sm:text-lg" wordMs={360} holdMs={1700} />
                  </div>
                </Reveal>

                <Reveal delay={0.28} y={18}>
                  <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
                    <MagneticButton
                      onClick={() => navigate(WELCOME_DEMO_TARGET)}
                      className="group inline-flex items-center rounded-xl bg-[#62f5c4] px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition-shadow hover:shadow-[0_14px_48px_rgba(98,245,196,0.4)] sm:text-base"
                    >
                      開始體驗
                      <ArrowRight aria-hidden="true" className="ml-2 inline-block h-4 w-4 align-[-3px] transition-transform duration-300 group-hover:translate-x-1" />
                    </MagneticButton>
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
                </Reveal>

                <Reveal delay={0.34} y={14}>
                  <p className="mt-4 text-[11px] leading-5 text-slate-500">
                    「開始體驗」會帶你進入展示歌單；已經是回訪使用者？上方「開啟播放器」直接進入歌單選擇。
                  </p>
                </Reveal>
              </div>

              {/* Floating album card, drifting above the light show. */}
              <div className="relative hidden min-h-[380px] overflow-hidden lg:block" aria-hidden="true">
                <div className="absolute right-[-6%] top-[14%] w-[300px]">
                  <div className="stage-float rounded-[42px] border border-white/20 bg-white/10 p-3 shadow-[0_40px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                    {PREVIEW_SONGS[0] && (
                      <>
                        <CoverImage src={PREVIEW_SONGS[0].coverUrl} alt="" wrapperClassName="h-[300px] w-full rounded-[32px]" className="h-full w-full rounded-[32px] object-cover opacity-90" />
                        <div className="absolute inset-x-7 bottom-7 rounded-2xl border border-white/15 bg-[#07090e]/75 p-3 backdrop-blur-xl">
                          <p className="text-xs font-bold text-white">{PREVIEW_SONGS[0].title}</p>
                          <p className="mt-1 text-[10px] text-[#62f5c4]">{typeof PREVIEW_SONGS[0].artists[0] === 'string' ? PREVIEW_SONGS[0].artists[0] : PREVIEW_SONGS[0].artists[0]?.name} · 本機音檔展示</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="stage-eq absolute bottom-[16%] left-[9%] flex h-8 items-end gap-1.5 opacity-80">
                  {[0, 1, 2, 3, 4, 5, 6].map(index => (
                    <span key={index} className="equalizer-bar" style={{ animationDelay: `${index * 0.13}s`, animationDuration: `${1 + (index % 3) * 0.22}s` }} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Stage modes marquee ---------------- */}
          <section className="stage-marquee-mask mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] py-3.5" aria-label="Echora 舞台視覺模式">
            <div className="stage-marquee flex w-max">
              {[0, 1].map(copy => (
                <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                  {STAGE_MODES.map(mode => (
                    <span key={`${copy}-${mode}`} className="mx-2.5 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-slate-400">
                      <span className="h-1 w-1 rounded-full bg-[#62f5c4]/70" /> {mode}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- Stage demo: lyrics x lights, in sync ---------------- */}
          <Reveal className="mt-10" y={36}>
            <section className="relative overflow-hidden rounded-[26px] border border-white/10 shadow-2xl sm:rounded-[30px]">
              <div className="absolute inset-0 bg-[#0a0d14]" aria-hidden="true">
                {DEMO_SCENES.map((scene, index) => (
                  <div
                    key={scene.mode}
                    className="stage-scene-bg absolute inset-0"
                    style={{ background: scene.bg, opacity: demoScene === index ? 1 : 0 }}
                  />
                ))}
              </div>

              <div className="relative z-10 flex flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-14">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                    <Radio aria-hidden="true" className="h-3 w-3 text-[#62f5c4]" /> Stage preview
                  </span>
                  <span key={activeScene.mode} className="stage-chip-enter inline-flex items-center gap-1.5 rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#b8ffe2]">
                    <Sparkles aria-hidden="true" className="h-3 w-3" /> {activeScene.mode}
                  </span>
                </div>

                <KaraokeLine
                  lines={DEMO_SCENES.map(scene => scene.line)}
                  onLineChange={handleDemoSceneChange}
                  accent={activeScene.accent}
                  className="mt-8 max-w-3xl font-heading text-[1.7rem] font-black leading-snug tracking-tight sm:text-4xl sm:leading-snug lg:text-5xl"
                  wordMs={460}
                  holdMs={2000}
                />

                <div className="mt-9 flex items-center gap-2.5" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map(index => <span key={index} className="beat-dot" />)}
                </div>
                <p className="mt-4 max-w-md text-[11px] leading-5 text-slate-500">
                  實際播放時，燈光、歌詞與視覺模式會跟著音樂的節奏走——上面只是靜靜的預覽。
                </p>
              </div>
            </section>
          </Reveal>

          {/* ---------------- Flow strip ---------------- */}
          <Reveal className="mt-6" y={20}>
            <section className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-center text-[11px] font-bold tracking-wide text-slate-400 sm:text-xs" aria-label="Echora 使用流程">
              <span className="text-white">選歌</span><span aria-hidden="true" className="text-[#62f5c4]">→</span>
              <span>播放</span><span aria-hidden="true" className="text-[#62f5c4]">→</span>
              <span className="text-[#b8ffe2]">Stage</span>
            </section>
          </Reveal>

          {/* ---------------- Features: tilt + spotlight cards ---------------- */}
          <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Echora 功能特色">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.09} y={30}>
                <TiltCard className="h-full">
                  <article className="spotlight-card h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-xl transition-colors duration-300 hover:border-[#62f5c4]/30">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 text-[#62f5c4] transition-transform duration-300">
                      <feature.icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <h2 className="mt-4 font-heading text-lg font-extrabold text-white">{feature.title}</h2>
                    <p className="mt-2 text-[13px] leading-6 text-slate-400">{feature.description}</p>
                  </article>
                </TiltCard>
              </Reveal>
            ))}
          </section>

          {/* ---------------- Final CTA ---------------- */}
          <Reveal className="mt-10" y={34}>
            <section className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#142e32] via-[#101922] to-[#111126] p-6 text-center shadow-2xl sm:p-10">
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <div className="stage-aurora stage-aurora-1 absolute left-1/2 top-full h-64 w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#62f5c4]/15" />
              </div>
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 text-[#62f5c4]"><Sparkles aria-hidden="true" className="h-5 w-5" /></span>
              <h2 className="relative mt-4 font-heading text-2xl font-extrabold tracking-tight text-white sm:text-3xl">準備好上台了嗎？</h2>
              <p className="relative mx-auto mt-2 max-w-md text-[13px] leading-6 text-slate-400">不需要帳號，五首免版稅展示曲目已經就位。安裝到主畫面後，Echora 會直接從歌單選擇開始。</p>
              <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
                <MagneticButton
                  onClick={() => navigate(WELCOME_DEMO_TARGET)}
                  className="inline-flex items-center rounded-xl bg-[#62f5c4] px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition-shadow hover:shadow-[0_14px_48px_rgba(98,245,196,0.4)]"
                >
                  <Play aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />開始體驗
                </MagneticButton>
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
          </Reveal>
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
    </MotionConfig>
  );
}
