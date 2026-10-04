import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MotionConfig, motion, useReducedMotion, useScroll } from 'framer-motion';
import { ArrowRight, Download, ListMusic, Mic2, MonitorSmartphone, Radio, ShieldCheck, Sparkles } from 'lucide-react';
import { LOCAL_DEMO_SONGS } from '../store/localDemoSongs';
import type { LocalDemoSong } from '../store/localDemoSongs';
import { CoverImage } from '../components/LoadingSkeletons';
import StageLightCanvas from '../components/landing/StageLightCanvas';
import KaraokeLine from '../components/landing/KaraokeLine';
import TiltCard from '../components/landing/TiltCard';
import MagneticButton from '../components/landing/MagneticButton';
import Reveal from '../components/landing/Reveal';
import StagePreviewTransport from '../components/landing/StagePreviewTransport';
import BrandMark from '../components/BrandMark';
import '../styles/landing.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const FEATURES = [
  { icon: Mic2, title: 'welcome.featureStageTitle', description: 'welcome.featureStageDesc' },
  { icon: ListMusic, title: 'welcome.featureMusicTitle', description: 'welcome.featureMusicDesc' },
  { icon: MonitorSmartphone, title: 'welcome.featureInstallTitle', description: 'welcome.featureInstallDesc' },
] as const;

const PREVIEW_SONGS = LOCAL_DEMO_SONGS.slice(0, 4);

/** Folia visualizer mode names — also the landing marquee strip. */
const STAGE_MODES = ['Luminous', 'Fume', 'Monet', '镜台', '云阶', 'Pendolo', '商籁', 'Tilt', 'Mindscape', 'Cappella', 'Claddagh'];

/**
 * The landing "stage" cycles these scenes. Each one carries the two colors the
 * player reads from its theme — `accent` drives the lyric glow and `primary`
 * the second ambient blob — so the page is lit by the same palette /player is.
 */
const DEMO_SCENES = [
  {
    line: 'welcome.demoScene1Line',
    mode: 'Luminous',
    accent: '#62f5c4',
    primary: '#6366f1',
    accentGlow: 'rgba(98, 245, 196, 0.6)',
    bg: 'radial-gradient(120% 90% at 50% 110%, rgba(98,245,196,0.16), transparent 62%)',
    wash: 'radial-gradient(90% 60% at 18% 12%, rgba(98,245,196,0.15), transparent 60%)',
  },
  {
    line: 'welcome.demoScene2Line',
    mode: 'Fume',
    accent: '#a5b4fc',
    primary: '#22d3ee',
    accentGlow: 'rgba(165, 180, 252, 0.62)',
    bg: 'radial-gradient(120% 90% at 50% 110%, rgba(129,140,248,0.18), transparent 62%)',
    wash: 'radial-gradient(90% 60% at 78% 18%, rgba(129,140,248,0.16), transparent 60%)',
  },
  {
    line: 'welcome.demoScene3Line',
    mode: 'Monet',
    accent: '#c4b5fd',
    primary: '#62f5c4',
    accentGlow: 'rgba(196, 181, 253, 0.62)',
    bg: 'radial-gradient(120% 90% at 50% 110%, rgba(167,139,250,0.17), transparent 62%)',
    wash: 'radial-gradient(90% 60% at 50% 8%, rgba(167,139,250,0.15), transparent 62%)',
  },
] as const;

/** Karaoke cadence for the stage preview (one scene = one lyric line). */
const SCENE_WORD_MS = 430;
const SCENE_STAGGER = 0.55;
const SCENE_HOLD_MS = 2100;

const sceneDurationMs = (line: string) =>
  Math.round(Array.from(line).length * SCENE_WORD_MS * SCENE_STAGGER + SCENE_WORD_MS + SCENE_HOLD_MS);

const artistName = (song: LocalDemoSong) =>
  typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || '';

/** Landing "開始體驗" target: the demo experience inside the app shell. */
export const WELCOME_DEMO_TARGET = '/app?demo=1';
/** Low-key entrance for returning users who already know Echora. */
export const WELCOME_APP_TARGET = '/app';

export default function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { scrollYProgress } = useScroll();
  const [demoScene, setDemoScene] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
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

  const sceneLines = useMemo(() => DEMO_SCENES.map(scene => t(scene.line)), [t]);
  const activeScene = DEMO_SCENES[demoScene] ?? DEMO_SCENES[0];
  const activeSong = PREVIEW_SONGS[demoScene] ?? PREVIEW_SONGS[0];
  const sceneMs = sceneDurationMs(sceneLines[demoScene] ?? '');

  // Auto-advance the preview like a playlist — but never for reduced-motion
  // visitors, who get a single static scene they can still step through.
  useEffect(() => {
    if (!isPreviewPlaying || prefersReducedMotion) return;
    const timer = window.setTimeout(() => setDemoScene(index => (index + 1) % DEMO_SCENES.length), sceneMs);
    return () => window.clearTimeout(timer);
  }, [demoScene, isPreviewPlaying, prefersReducedMotion, sceneMs]);

  const stepScene = useCallback((delta: number) => {
    setDemoScene(index => (index + delta + DEMO_SCENES.length) % DEMO_SCENES.length);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-hidden bg-[#07090e] font-sans text-slate-100 selection:bg-[#62f5c4] selection:text-black">
        {/* ---------- Immersive backdrop: the player's own lighting rig ----------
            Same recipe as /player: a scene-tinted wash, two drifting ambient
            glow blobs fed by the active theme colors, and the cinematic grain. */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          {DEMO_SCENES.map((scene, index) => (
            <div
              key={scene.mode}
              className="stage-ambient-wash absolute inset-0"
              style={{ background: scene.wash, opacity: demoScene === index ? 1 : 0 }}
            />
          ))}
          <div className={`absolute inset-0 opacity-[0.28] blur-3xl ${isPreviewPlaying ? '' : 'paused-motion'}`}>
            <div
              className="animate-blob-1 absolute -left-40 -top-52 h-[34rem] w-[34rem] rounded-full"
              style={{ background: activeScene.accent }}
            />
            <div
              className="animate-blob-2 absolute -bottom-52 -right-40 h-[34rem] w-[34rem] rounded-full"
              style={{ background: activeScene.primary }}
            />
          </div>
          <div className="absolute inset-0 bg-[#07090e]/60" />
          <div className="ambient-grain absolute inset-0 opacity-60" />
          <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#07090e] to-transparent" />
          <div className="stage-vignette absolute inset-0" />
        </div>

        <header className="glass-panel sticky top-0 z-40 border-b border-white/[0.08]">
          <div className="mx-auto flex h-[76px] max-w-[1200px] items-center justify-between gap-3 px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <BrandMark size={40} />
              <span>
                <span className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight text-white">ECHORA <span className="rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-wide text-[#62f5c4]">STAGE</span></span>
                <span className="hidden text-[10px] font-medium tracking-[0.16em] text-slate-500 sm:block">LYRICS / LIGHT / MOTION</span>
              </span>
            </div>
            {/* Low-key entrance for returning users; the main CTA below targets new visitors. */}
            <button
              type="button"
              onClick={() => navigate(WELCOME_APP_TARGET)}
              className="btn-spring min-h-11 rounded-2xl bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-white hover:bg-white/[0.12] sm:text-sm"
            >
              {t('welcome.openPlayer')}
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
          {/* ---------------- Hero: copy standing on the stage floor ---------------- */}
          <section className="grid items-center gap-8 pb-2 pt-10 sm:pt-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pt-16">
            <div>
              <Reveal y={16}>
                <span className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3.5 py-2 text-[10px] font-bold tracking-wide text-[#62f5c4] sm:text-[11px]">
                  <span className="stage-eq flex h-4 items-end gap-[3px]" aria-hidden="true">
                    <span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" />
                  </span>
                  {t('welcome.heroBadge')}
                </span>
              </Reveal>

              <Reveal delay={0.08} y={22}>
                <h1 className="max-w-2xl font-heading text-[2.2rem] font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">
                  {t('welcome.heroLine1')}<br />
                  <span className="stage-headline-accent">{t('welcome.heroLine2')}</span>
                </h1>
              </Reveal>

              <Reveal delay={0.16} y={20}>
                <p className="mt-4 max-w-xl text-[13px] leading-6 text-slate-300/80 sm:mt-6 sm:text-base sm:leading-7">
                  {t('welcome.heroParagraph')}
                </p>
              </Reveal>

              <Reveal delay={0.24} y={18}>
                <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
                  <MagneticButton
                    onClick={() => navigate(WELCOME_DEMO_TARGET)}
                    className="group inline-flex items-center rounded-xl bg-[#62f5c4] px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition-shadow hover:shadow-[0_14px_48px_rgba(98,245,196,0.4)] sm:text-base"
                  >
                    {t('welcome.startDemo')}
                    <ArrowRight aria-hidden="true" className="ml-2 inline-block h-4 w-4 align-[-3px] transition-transform duration-300 group-hover:translate-x-1" />
                  </MagneticButton>
                  {deferredPrompt && (
                    <button
                      type="button"
                      onClick={() => void handleInstall()}
                      className="rounded-xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-5 py-3 text-sm font-bold text-[#62f5c4] transition hover:bg-[#62f5c4]/20"
                    >
                      <Download aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />{t('welcome.addToHome')}
                    </button>
                  )}
                </div>
              </Reveal>

              <Reveal delay={0.3} y={14}>
                <p className="mt-4 max-w-xl text-[11px] leading-5 text-slate-500">
                  {t('welcome.demoHint')}
                </p>
              </Reveal>
            </div>

            {/* Showcase queue: the covers fanned out like the player's coverflow,
                re-stacked whenever the stage preview moves to the next scene. */}
            <div className="pointer-events-none relative hidden min-h-[380px] lg:block" aria-hidden="true">
              {PREVIEW_SONGS.slice(0, DEMO_SCENES.length).map((song, index) => {
                const offset = index - demoScene;
                const isActive = offset === 0;
                return (
                  <div
                    key={song.id}
                    className="absolute right-[8%] top-[6%] w-[252px] transition-all duration-700"
                    style={{
                      transform: `translate3d(${offset * 30}px, ${offset * 16}px, 0) rotate(${offset * 7 + 5}deg) scale(${isActive ? 1 : 0.9})`,
                      opacity: isActive ? 1 : 0.38,
                      zIndex: isActive ? 3 : 1,
                      transitionTimingFunction: 'var(--ease-out-smooth)',
                    }}
                  >
                    <div
                      className="stage-float rounded-[34px] border border-white/20 bg-white/10 p-2.5 shadow-[0_40px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                      style={{ animationDelay: `${index * -2.4}s` }}
                    >
                      <CoverImage
                        src={song.coverUrl}
                        alt=""
                        wrapperClassName="h-[252px] w-full rounded-[26px]"
                        className="h-full w-full rounded-[26px] object-cover"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="glass-panel absolute bottom-[4%] left-0 rounded-2xl border border-white/[0.08] px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#62f5c4]">{t('welcome.localAudioLabel')}</p>
                <p className="mt-1 font-heading text-sm font-extrabold text-white">{activeSong?.title}</p>
                <p className="text-[11px] text-slate-400">{activeSong ? artistName(activeSong) : ''}</p>
              </div>
              <div className="stage-eq absolute bottom-[12%] right-[4%] flex h-8 items-end gap-1.5 opacity-80">
                {[0, 1, 2, 3, 4, 5, 6].map(index => (
                  <span key={index} className="equalizer-bar" style={{ animationDelay: `${index * 0.13}s`, animationDuration: `${1 + (index % 3) * 0.22}s` }} />
                ))}
              </div>
            </div>
          </section>

          {/* ---------------- Stage modes marquee ---------------- */}
          <section className="stage-marquee-mask mt-8 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] py-3.5" aria-label={t('welcome.stageModesAria')}>
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

          {/* ---------------- The stage: /player's furniture, live on the landing ----------------
              Blurred artwork backdrop, the track header card, a karaoke lyric
              line and the transport bar — the same pieces you get after tapping
              開始體驗, driven by real prev / next / pause controls. */}
          <Reveal className="mt-6" y={36}>
            <section className="relative overflow-hidden rounded-[28px] border border-white/10 shadow-2xl sm:rounded-[34px]" aria-label={t('welcome.stagePreviewBadge')}>
              <div className="absolute inset-0 bg-[#0a0d14]" aria-hidden="true">
                {DEMO_SCENES.map((scene, index) => (
                  <div
                    key={scene.mode}
                    className="stage-scene-bg absolute inset-0"
                    style={{ background: scene.bg, opacity: demoScene === index ? 1 : 0 }}
                  />
                ))}
                {PREVIEW_SONGS.slice(0, DEMO_SCENES.length).map((song, index) => (
                  <div
                    key={`art-${song.id}`}
                    className="stage-preview-art absolute inset-0"
                    style={{ backgroundImage: `url(${song.coverUrl})`, opacity: demoScene === index ? 0.28 : 0 }}
                  />
                ))}
              </div>
              <div className="absolute inset-0 opacity-70" aria-hidden="true">
                <StageLightCanvas className="h-full w-full" />
              </div>
              {/* Keeps the lyric line crisp above the artwork wash. */}
              <div
                className="absolute inset-0"
                aria-hidden="true"
                style={{ background: 'radial-gradient(72% 58% at 50% 46%, rgba(7,9,14,0.6), rgba(7,9,14,0) 72%)' }}
              />

              <div className="relative z-10 flex min-h-[520px] flex-col justify-between gap-6 p-4 sm:min-h-[560px] sm:p-6 lg:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* The player's own track header card, showing the showcase track. */}
                  <div className="glass-card flex items-center gap-3.5 rounded-3xl p-3 sm:gap-5 sm:p-3.5">
                    <div className="relative">
                      <CoverImage
                        src={activeSong?.coverUrl}
                        alt=""
                        wrapperClassName="h-14 w-14 rounded-2xl sm:h-16 sm:w-16"
                        className="h-14 w-14 rounded-2xl object-cover shadow-2xl sm:h-16 sm:w-16"
                      />
                      {isPreviewPlaying && (
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#62f5c4] shadow-[0_0_10px_#62f5c4]">
                          <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="max-w-[10rem] truncate font-heading text-lg font-extrabold tracking-tight text-white drop-shadow-md sm:max-w-xs sm:text-2xl">
                        {activeSong?.title}
                      </h2>
                      <p className="mt-0.5 truncate text-xs font-semibold text-[#62f5c4] sm:text-sm">
                        {activeSong ? artistName(activeSong) : ''}{activeSong?.album?.name ? ` • ${activeSong.album.name}` : ''}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b8ffe2]">{t('welcome.localAudioLabel')}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                      <Radio aria-hidden="true" className="h-3 w-3 text-[#62f5c4]" /> {t('welcome.stagePreviewBadge')}
                    </span>
                    <span key={activeScene.mode} className="stage-chip-enter inline-flex items-center gap-1.5 rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3 py-1.5 text-[10px] font-bold tracking-wide text-[#b8ffe2]">
                      <Sparkles aria-hidden="true" className="h-3 w-3" /> {activeScene.mode}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
                  <KaraokeLine
                    lines={sceneLines}
                    activeIndex={demoScene}
                    accent={activeScene.accentGlow}
                    className="max-w-3xl text-center font-heading text-[1.6rem] font-black leading-snug tracking-tight sm:text-4xl sm:leading-snug lg:text-5xl"
                    wordMs={SCENE_WORD_MS}
                    holdMs={SCENE_HOLD_MS}
                    onLineChange={handleDemoSceneChange}
                  />
                  <div className="flex items-center gap-2.5" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map(index => <span key={index} className="beat-dot" />)}
                  </div>
                </div>

                <div className="space-y-3">
                  <StagePreviewTransport
                    isPlaying={isPreviewPlaying}
                    onTogglePlay={() => setIsPreviewPlaying(value => !value)}
                    onPrev={() => stepScene(-1)}
                    onNext={() => stepScene(1)}
                    onStartDemo={() => navigate(WELCOME_DEMO_TARGET)}
                    stageMode={activeScene.mode}
                    sceneMs={sceneMs}
                    durationMs={activeSong?.durationMs ?? 0}
                    sceneKey={demoScene}
                  />
                  <p className="text-center text-[11px] leading-5 text-slate-500">
                    {t('welcome.stagePreviewHint')}
                  </p>
                </div>
              </div>
            </section>
          </Reveal>

          {/* ---------------- Flow strip ---------------- */}
          <Reveal className="mt-6" y={20}>
            <section className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-center text-[11px] font-bold tracking-wide text-slate-400 sm:text-xs" aria-label={t('welcome.flowAria')}>
              <span className="text-white">{t('welcome.flowPick')}</span><span aria-hidden="true" className="text-[#62f5c4]">→</span>
              <span>{t('welcome.flowPlay')}</span><span aria-hidden="true" className="text-[#62f5c4]">→</span>
              <span className="text-[#b8ffe2]">Stage</span>
            </section>
          </Reveal>

          {/* ---------------- Features: tilt + spotlight glass cards ---------------- */}
          <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label={t('welcome.featuresAria')}>
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.09} y={30}>
                <TiltCard className="h-full">
                  <article className="glass-card spotlight-card h-full rounded-3xl p-6 shadow-xl">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 text-[#62f5c4] transition-transform duration-300">
                      <feature.icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <h2 className="mt-4 font-heading text-lg font-extrabold text-white">{t(feature.title)}</h2>
                    <p className="mt-2 text-[13px] leading-6 text-slate-400">{t(feature.description)}</p>
                  </article>
                </TiltCard>
              </Reveal>
            ))}
          </section>

          {/* ---------------- Final CTA ---------------- */}
          <Reveal className="mt-10" y={34}>
            <section className="glass-panel relative overflow-hidden rounded-[28px] border border-white/[0.08] p-6 text-center shadow-2xl sm:rounded-[34px] sm:p-10">
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="stage-aurora stage-aurora-1 absolute left-1/2 top-full h-64 w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#62f5c4]/15" />
              </div>
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 text-[#62f5c4]"><Sparkles aria-hidden="true" className="h-5 w-5" /></span>
              <h2 className="relative mt-4 font-heading text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{t('welcome.readyTitle')}</h2>
              <p className="relative mx-auto mt-2 max-w-md text-[13px] leading-6 text-slate-400">{t('welcome.readyParagraph')}</p>
              <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
                <MagneticButton
                  onClick={() => navigate(WELCOME_DEMO_TARGET)}
                  className="inline-flex items-center rounded-xl bg-[#62f5c4] px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition-shadow hover:shadow-[0_14px_48px_rgba(98,245,196,0.4)]"
                >
                  <ArrowRight aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />{t('welcome.startDemo')}
                </MagneticButton>
                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={() => void handleInstall()}
                    className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    <Download aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />{t('welcome.addToHome')}
                  </button>
                )}
              </div>
            </section>
          </Reveal>
        </main>

        {/*
          Footer, in three quiet bands instead of one dense stack:
            1. who built it (attribution + the English one-liner for reviewers)
            2. policy links, split into "ours" and "Google's" so the two
               third-party links have a reason to be here
            3. the YouTube API Services / Limited Use disclosure

          Every link stays a plain anchor (never an onClick button): Google's
          OAuth brand verification reviews the homepage itself, and a crawlable
          href is what both the reviewer and the crawler can follow. Keep these
          hrefs identical to the URLs configured on the consent screen.
        */}
        <footer className="relative z-10 border-t border-white/[0.07] px-5 py-7 sm:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
              <div className="max-w-md">
                <p className="text-[11px] leading-5 text-slate-500">
                  {t('welcome.footerAttribution')}{' '}
                  <a href="https://github.com/chthollyphile/folia-major" target="_blank" rel="noreferrer" className="footer-link underline decoration-white/20 underline-offset-2">folia-major</a>
                </p>
                {/* The UI ships in zh-TW + en, and the homepage must describe the
                    app for English-reading reviewers too. */}
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Echora is a browser-based immersive lyrics stage — synced lyrics, visualizer stages and AI themes.
                </p>
              </div>

              <nav aria-label={t('welcome.footerNavAria')} className="flex flex-col gap-1.5 text-[11px] sm:items-end">
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:justify-end">
                  <Link to="/privacy" className="footer-link">{t('welcome.footerPrivacy')}</Link>
                  <span aria-hidden="true" className="text-white/15">·</span>
                  <Link to="/terms" className="footer-link">{t('welcome.footerTerms')}</Link>
                </span>
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:justify-end">
                  <span className="text-slate-600">{t('welcome.footerGooglePolicies')}</span>
                  <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="footer-link">{t('welcome.footerYoutubeTerms')}</a>
                  <span aria-hidden="true" className="text-white/15">·</span>
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="footer-link">{t('welcome.footerGooglePrivacy')}</a>
                </span>
                <Link to={WELCOME_APP_TARGET} className="footer-link sm:self-end">{t('welcome.footerOpenPlayer')}</Link>
              </nav>
            </div>

            <p className="flex max-w-3xl items-start gap-2 text-[11px] leading-5 text-slate-500">
              <ShieldCheck aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#62f5c4]/70" />
              <span>{t('welcome.footerDataNote')}</span>
            </p>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
