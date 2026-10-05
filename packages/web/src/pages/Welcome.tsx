import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, Code2, Download, Languages, ShieldCheck, Sparkles, Volume2, VolumeX } from 'lucide-react';
import type { LyricLine } from '@echora/core';
import { LOCAL_DEMO_LYRICS, LOCAL_DEMO_SONGS } from '../store/localDemoSongs';
import type { LocalDemoSong } from '../store/localDemoSongs';
import { getLanguage, setLanguage } from '../i18n';
import { writeLandingHandoff } from '../utils/landingHandoff';
import { CoverImage } from '../components/LoadingSkeletons';
import BrandMark from '../components/BrandMark';
import StageLightCanvas from '../components/landing/StageLightCanvas';
import SyncedLyric from '../components/landing/SyncedLyric';
import ModeCanvas from '../components/landing/ModeCanvas';
import MagneticButton from '../components/landing/MagneticButton';
import ScrollTextReveal from '../components/landing/ScrollTextReveal';
import { LANDING_FEATURES, MODE_SCENES } from '../components/landing/landingContent';
import { useLandingAudio } from '../components/landing/useLandingAudio';
import { gsap, registerScroll, ScrollTrigger, useLenis } from '../components/landing/scroll';
import '../styles/landing.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Landing "開始體驗" target: the demo experience inside the app shell. */
export const WELCOME_DEMO_TARGET = '/app?demo=1';
/** Low-key entrance for returning users who already know Echora. */
export const WELCOME_APP_TARGET = '/app';

/** The song the landing performs: the first showcase track. */
const SHOW_SONG: LocalDemoSong = LOCAL_DEMO_SONGS[0];
/** Demo transcripts store milliseconds; the lyric stage reads seconds like the player clock. */
const SHOW_LYRICS: LyricLine[] = (LOCAL_DEMO_LYRICS[SHOW_SONG.id]?.lines ?? []).map(line => ({
  time: line.startTime / 1000,
  text: line.fullText,
  words: line.words.map(word => ({ time: word.startTime / 1000, end: word.endTime / 1000, text: word.text })),
}));
const SHOW_COVERS = LOCAL_DEMO_SONGS.slice(0, 3);

const artistName = (song: LocalDemoSong) =>
  typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || '';

const isIosSafari = () =>
  typeof navigator !== 'undefined'
  && /iP(hone|ad|od)/.test(navigator.userAgent)
  && !/CriOS|FxiOS/.test(navigator.userAgent)
  && !(window.matchMedia?.('(display-mode: standalone)').matches);

export default function Welcome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const overtureRef = useRef<HTMLElement>(null);
  const lyricStageRef = useRef<HTMLDivElement>(null);
  const kickerRef = useRef<HTMLDivElement>(null);
  const heroBlockRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const modesRef = useRef<HTMLElement>(null);
  const modesNameRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const featuresTrackRef = useRef<HTMLDivElement>(null);
  const finaleRef = useRef<HTMLElement>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [modeIndex, setModeIndex] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [showIosHint, setShowIosHint] = useState(false);
  const [language, setLanguageState] = useState(() => getLanguage());

  const { engine, status, soundEnabled } = useLandingAudio(SHOW_SONG.audioUrl ?? '', SHOW_SONG.durationMs ?? 120000);
  const getTime = useCallback(() => engine.getTime(), [engine]);
  const getEnergy = useCallback(() => engine.getEnergy(), [engine]);
  const getProgress = useCallback(() => 0.5 + engine.getEnergy() * 0.5, [engine]);

  useLenis();

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    setShowIosHint(isIosSafari());
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const toggleLanguage = () => {
    const next = getLanguage() === 'en' ? 'zh-TW' : 'en';
    setLanguage(next);
    setLanguageState(next);
  };

  const handleSound = () => {
    if (soundEnabled) engine.mute();
    else void engine.enableSound();
  };

  /** Hand the running song to /app so the stage simply expands into the player. */
  const startDemo = () => {
    writeLandingHandoff({ songId: SHOW_SONG.id, time: engine.getTime(), soundEnabled });
    navigate(WELCOME_DEMO_TARGET);
  };

  const activeMode = MODE_SCENES[modeIndex] ?? MODE_SCENES[0];
  const modeTheme = activeMode.theme;
  const lyricAccent = useMemo(() => `${modeTheme.accentColor}99`, [modeTheme.accentColor]);
  const handleLineChange = useCallback((index: number) => setCurrentLine(index), []);

  // ------------------------------------------------------------------
  // Scroll choreography. Scroll position is the playhead: every act is a
  // pinned, scrubbed GSAP timeline. Under reduced motion none of this runs
  // and the acts simply stack as readable sections.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || !rootRef.current) return;
    registerScroll();
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const overture = overtureRef.current;
      const modes = modesRef.current;
      const features = featuresRef.current;
      const track = featuresTrackRef.current;
      const finale = finaleRef.current;
      if (!overture || !modes || !features || !track || !finale) return;

      // Act I — Overture: the lyric shrinks into the "now playing" slot while
      // the headline rises from the stage floor.
      const overtureTl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: overture, start: 'top top', end: '+=140%', pin: true, scrub: 0.7, anticipatePin: 1 },
      });
      overtureTl
        .to(lyricStageRef.current, { scale: 0.5, yPercent: -56, transformOrigin: '50% 50%' }, 0)
        .to(kickerRef.current, { opacity: 0, y: -24 }, 0)
        .to(scrollCueRef.current, { opacity: 0, y: 12 }, 0)
        .fromTo(heroBlockRef.current, { opacity: 0, y: 96 }, { opacity: 1, y: 0 }, 0.18)
        .fromTo('[data-hero-chip]', { opacity: 0, y: 18 }, { opacity: 1, y: 0, stagger: 0.06 }, 0.55);

      // Act II — Modes: scrub through the real visualizer engines.
      const modeCount = MODE_SCENES.length;
      ScrollTrigger.create({
        trigger: modes,
        start: 'top top',
        end: `+=${modeCount * 70}%`,
        pin: true,
        scrub: true,
        anticipatePin: 1,
        onUpdate: self => {
          const index = Math.min(modeCount - 1, Math.floor(self.progress * modeCount));
          setModeIndex(current => (current === index ? current : index));
        },
      });
      gsap.fromTo('[data-modes-copy]', { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: modes, start: 'top 70%', end: 'top 15%', scrub: true },
      });

      // Act III — Features: a horizontal "cue sheet" scrubbed sideways.
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: { trigger: features, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
      });

      // Finale: the device frames assemble out of the song's covers.
      gsap.fromTo('[data-finale-frame]', { y: 140, rotate: (index: number) => (index - 1) * 14, opacity: 0 }, {
        y: 0, rotate: (index: number) => (index - 1) * 5, opacity: 1, stagger: 0.12, ease: 'none',
        scrollTrigger: { trigger: finale, start: 'top 85%', end: 'top 25%', scrub: 0.5 },
      });

      ScrollTrigger.refresh();
    });

    return () => mm.revert();
  }, []);

  // Relight the whole page when the mode on stage changes (GSAP tweens the
  // CSS custom properties so every blob / glow morphs instead of snapping).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;
    gsap.to(root, {
      '--stage-accent': modeTheme.accentColor,
      '--stage-primary': modeTheme.primaryColor,
      '--stage-secondary': modeTheme.secondaryColor,
      duration: 1.1,
      ease: 'power2.out',
      overwrite: 'auto',
    });
    if (modesNameRef.current) {
      gsap.fromTo(modesNameRef.current, { opacity: 0, y: 36, filter: 'blur(14px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out' });
    }
  }, [modeTheme]);

  const soundLabel = soundEnabled && status !== 'unavailable' ? t('welcome.soundOn') : t('welcome.soundOff');

  return (
    <div
      ref={rootRef}
      data-landing
      className="landing-root relative min-h-screen overflow-x-clip bg-[#07090e] font-sans text-slate-100 selection:bg-[#62f5c4] selection:text-black"
      style={{
        ['--stage-accent' as string]: MODE_SCENES[0].theme.accentColor,
        ['--stage-primary' as string]: MODE_SCENES[0].theme.primaryColor,
        ['--stage-secondary' as string]: MODE_SCENES[0].theme.secondaryColor,
      }}
    >
      {/* ---------- House lighting: ambient blobs fed by the mode on stage ---------- */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 opacity-[0.32] blur-3xl">
          <div className="animate-blob-1 absolute -left-40 -top-52 h-[36rem] w-[36rem] rounded-full" style={{ background: 'var(--stage-accent)' }} />
          <div className="animate-blob-2 absolute -bottom-52 -right-40 h-[36rem] w-[36rem] rounded-full" style={{ background: 'var(--stage-primary)' }} />
        </div>
        <div className="absolute inset-0 bg-[#07090e]/55" />
        <div className="ambient-grain absolute inset-0 opacity-60" />
        <div className="stage-vignette absolute inset-0" />
      </div>

      {/* ---------- Header ---------- */}
      <header className="fixed inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <BrandMark size={36} />
            <span className="flex items-center gap-2 font-heading text-base font-extrabold tracking-tight text-white">
              ECHORA
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-wide" style={{ color: 'var(--stage-accent)' }}>STAGE</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSound}
              aria-pressed={soundEnabled}
              aria-label={t('welcome.toggleSound')}
              className="btn-spring glass-pill inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-bold tracking-wide text-slate-200 hover:bg-white/10"
            >
              {soundEnabled ? <Volume2 aria-hidden="true" className="h-4 w-4" style={{ color: 'var(--stage-accent)' }} /> : <VolumeX aria-hidden="true" className="h-4 w-4 text-slate-400" />}
              <span className="hidden sm:inline">{soundLabel}</span>
              {soundEnabled && (
                <span className="stage-eq flex h-3 items-end gap-[2px]" aria-hidden="true">
                  <span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" />
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={t('welcome.languageToggle')}
              className="btn-spring glass-pill inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-white/10"
            >
              <Languages aria-hidden="true" className="h-4 w-4" />
              {i18n.language.startsWith('en') ? '中' : 'EN'}
            </button>
            {/* Low-key entrance for returning users; the main CTA targets new visitors. */}
            <button
              type="button"
              onClick={() => navigate(WELCOME_APP_TARGET)}
              className="btn-spring min-h-10 rounded-full bg-white/[0.07] px-4 py-2 text-xs font-bold text-white hover:bg-white/[0.14] sm:text-sm"
            >
              {t('welcome.openPlayer')}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* ================= ACT I — OVERTURE ================= */}
        <section ref={overtureRef} data-act="overture" className="relative flex h-[100svh] min-h-[560px] flex-col overflow-hidden" aria-label={t('welcome.actOvertureKicker')}>
          <div className="absolute inset-0" aria-hidden="true">
            <div className="stage-preview-art absolute inset-0 opacity-30" style={{ backgroundImage: `url(${SHOW_SONG.coverUrl})` }} />
            <div className="absolute inset-0 bg-gradient-to-b from-[#07090e]/70 via-transparent to-[#07090e]" />
            <StageLightCanvas className="h-full w-full" getEnergy={getEnergy} />
          </div>

          {/* Now-performing kicker */}
          <div ref={kickerRef} className="relative z-10 mx-auto mt-[88px] flex w-full max-w-[1320px] items-center justify-between px-5 sm:px-8">
            <div className="glass-card flex items-center gap-3 rounded-2xl p-2 pr-4">
              <CoverImage src={SHOW_SONG.coverUrl} alt="" wrapperClassName="h-11 w-11 rounded-xl" className="h-11 w-11 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--stage-accent)' }}>{t('welcome.nowPerforming')}</p>
                <p className="truncate font-heading text-sm font-extrabold text-white">{SHOW_SONG.title}<span className="font-sans text-xs font-medium text-slate-400"> · {artistName(SHOW_SONG)}</span></p>
              </div>
            </div>
            <span className="glass-pill hidden rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 sm:inline-flex">
              {t('welcome.actOvertureKicker')} · {String(currentLine + 1).padStart(2, '0')}/{SHOW_LYRICS.length}
            </span>
          </div>

          {/* The lyric stage */}
          <div ref={lyricStageRef} className="relative z-10 flex flex-1 items-center justify-center px-5 sm:px-8">
            <SyncedLyric
              lines={SHOW_LYRICS}
              getTime={getTime}
              accent={lyricAccent}
              onLineChange={handleLineChange}
              className="mx-auto max-w-5xl text-center font-heading text-[clamp(1.9rem,6.2vw,5.6rem)] font-black leading-[1.08] tracking-[-0.03em]"
            />
          </div>

          {/* Hero copy — revealed by the scrub as the lyric recedes */}
          <div ref={heroBlockRef} data-hero-block className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto mx-auto w-full max-w-[1320px] px-5 sm:px-8">
              <h1 className="max-w-3xl font-heading text-[2.3rem] font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
                {t('welcome.heroLine1')}<br />
                <span className="stage-headline-accent">{t('welcome.heroLine2')}</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300/85 sm:text-base sm:leading-7">{t('welcome.heroSub')}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <MagneticButton
                  onClick={startDemo}
                  className="group inline-flex items-center rounded-xl px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition-shadow hover:shadow-[0_14px_48px_rgba(98,245,196,0.4)] sm:text-base"
                  style={{ background: 'var(--stage-accent)' }}
                >
                  {t('welcome.startDemo')}
                  <ArrowRight aria-hidden="true" className="ml-2 inline-block h-4 w-4 align-[-3px] transition-transform duration-300 group-hover:translate-x-1" />
                </MagneticButton>
                {!soundEnabled && (
                  <button
                    type="button"
                    onClick={() => void engine.enableSound()}
                    className="btn-spring inline-flex items-center rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    <Volume2 aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />{t('welcome.enterStage')}
                  </button>
                )}
              </div>
              <ul className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold tracking-wide text-slate-300" aria-label={t('welcome.featuresAria')}>
                {[t('welcome.heroBadge'), t('welcome.trustNoAccount'), t('welcome.trustNoUpload'), t('welcome.trustOpenSource')].map(chip => (
                  <li key={chip} data-hero-chip className="glass-pill rounded-full px-3 py-1.5">{chip}</li>
                ))}
              </ul>
            </div>
          </div>

          <div ref={scrollCueRef} className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400" aria-hidden="true">
            {t('welcome.scrollCue')}
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </div>
        </section>

        {/* ================= ACT II — MODES ================= */}
        <section ref={modesRef} data-act="modes" className="relative h-[100svh] min-h-[560px] overflow-hidden" aria-label={t('welcome.actModesKicker')}>
          <div className="absolute inset-0" aria-hidden="true">
            <ModeCanvas modeId={activeMode.id} theme={modeTheme} getProgress={getProgress} className="h-full w-full" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#07090e] via-transparent to-[#07090e]" />
          </div>
          <div className="relative z-10 mx-auto flex h-full max-w-[1320px] flex-col justify-between px-5 pb-10 pt-[96px] sm:px-8">
            <div data-modes-copy>
              <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--stage-accent)' }}>{t('welcome.actModesKicker')}</p>
              <h2 className="mt-2 max-w-2xl font-heading text-3xl font-black tracking-tight text-white sm:text-5xl">{t('welcome.actModesTitle')}</h2>
              <p className="mt-3 max-w-md text-sm text-slate-400">{t('welcome.actModesHint')}</p>
            </div>

            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div ref={modesNameRef} key={activeMode.id} className="min-w-0">
                <p className="font-heading text-[clamp(3.4rem,14vw,11rem)] font-black leading-[0.85] tracking-[-0.05em] text-white" style={{ textShadow: '0 0 60px var(--stage-accent)' }}>
                  {activeMode.name}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span className="font-heading text-xl font-extrabold text-white">{activeMode.nameZh}</span>
                  <span className="text-slate-400">{t(activeMode.descriptionKey)}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="glass-pill rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                  {t('welcome.modeIndex', { current: modeIndex + 1, total: MODE_SCENES.length })}
                </span>
                <ol className="flex items-center gap-1.5" aria-hidden="true">
                  {MODE_SCENES.map((scene, index) => (
                    <li key={scene.id} className="h-1.5 rounded-full transition-all duration-500" style={{ width: index === modeIndex ? 28 : 8, background: index === modeIndex ? 'var(--stage-accent)' : 'rgba(255,255,255,0.18)' }} />
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* ================= ACT III — YOUR MUSIC (horizontal cue sheet) ================= */}
        <section ref={featuresRef} data-act="features" className="relative h-[100svh] min-h-[560px] overflow-hidden" aria-label={t('welcome.featuresAria')}>
          <div className="mx-auto max-w-[1320px] px-5 pt-[96px] sm:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--stage-accent)' }}>{t('welcome.actFeaturesKicker')}</p>
            <h2 className="mt-2 max-w-2xl font-heading text-3xl font-black tracking-tight text-white sm:text-5xl">{t('welcome.actFeaturesTitle')}</h2>
          </div>
          <div ref={featuresTrackRef} className="mt-10 flex w-max gap-5 px-5 sm:mt-14 sm:px-8">
            {LANDING_FEATURES.map(feature => (
              <article key={feature.title} className="glass-card spotlight-card flex h-[min(52vh,420px)] w-[82vw] max-w-[440px] flex-col justify-between rounded-[28px] p-6 shadow-xl sm:w-[440px] sm:p-8">
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06]" style={{ color: 'var(--stage-accent)' }}>
                    <feature.icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="font-heading text-5xl font-black leading-none text-white/10">{feature.cue}</span>
                </div>
                <div>
                  <h3 className="font-heading text-2xl font-extrabold text-white">{t(feature.title)}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{t(feature.description)}</p>
                </div>
              </article>
            ))}
            <div className="flex w-[70vw] max-w-[360px] shrink-0 items-center justify-center">
              <MagneticButton onClick={startDemo} className="inline-flex items-center rounded-xl px-6 py-3.5 text-sm font-extrabold text-black" style={{ background: 'var(--stage-accent)' }}>
                {t('welcome.startDemo')}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </MagneticButton>
            </div>
          </div>
        </section>

        {/* ================= ACT IV — MANIFESTO ================= */}
        <section data-act="manifesto" className="relative mx-auto max-w-[1320px] px-5 py-28 sm:px-8 sm:py-40" aria-label={t('welcome.actManifestoKicker')}>
          <p className="text-center text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--stage-accent)' }}>{t('welcome.actManifestoKicker')}</p>
          <p className="mx-auto mt-8 max-w-5xl text-center font-heading text-[1.5rem] font-black leading-[1.45] tracking-tight text-white sm:text-4xl sm:leading-[1.4] lg:text-[3rem]">
            <ScrollTextReveal text={t('welcome.manifesto')} />
          </p>
        </section>

        {/* ================= FINALE ================= */}
        <section ref={finaleRef} data-act="finale" className="relative mx-auto max-w-[1320px] px-5 pb-20 sm:px-8" aria-label={t('welcome.actFinaleKicker')}>
          <div className="glass-panel relative overflow-hidden rounded-[32px] border border-white/[0.08] px-6 pb-10 pt-14 text-center shadow-2xl sm:px-12 sm:pt-20">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="stage-aurora stage-aurora-1 absolute left-1/2 top-full h-72 w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20" style={{ background: 'var(--stage-accent)' }} />
            </div>
            <p className="relative text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--stage-accent)' }}>{t('welcome.actFinaleKicker')}</p>
            <h2 className="relative mt-3 font-heading text-3xl font-black tracking-tight text-white sm:text-5xl">
              <ScrollTextReveal text={t('welcome.readyTitle')} />
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">{t('welcome.readyParagraph')}</p>

            <div className="relative mx-auto mt-10 flex items-end justify-center" aria-hidden="true">
              {SHOW_COVERS.map((song, index) => (
                <div
                  key={song.id}
                  data-finale-frame
                  className={`${index === 1 ? 'z-10 w-[170px] sm:w-[230px]' : 'w-[130px] sm:w-[180px]'} -mx-5 rounded-[26px] border border-white/15 bg-white/10 p-2 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:-mx-6`}
                >
                  <CoverImage src={song.coverUrl} alt="" wrapperClassName="aspect-square w-full rounded-[20px]" className="h-full w-full rounded-[20px] object-cover" />
                </div>
              ))}
            </div>

            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <MagneticButton onClick={startDemo} className="inline-flex items-center rounded-xl px-6 py-3.5 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)]" style={{ background: 'var(--stage-accent)' }}>
                <Sparkles aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />{t('welcome.startDemo')}
              </MagneticButton>
              {deferredPrompt && (
                <button type="button" onClick={() => void handleInstall()} className="btn-spring rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">
                  <Download aria-hidden="true" className="mr-2 inline-block h-4 w-4 align-[-3px]" />{t('welcome.addToHome')}
                </button>
              )}
            </div>
            {showIosHint && <p className="relative mt-4 text-[11px] text-slate-500">{t('welcome.iosInstallHint')}</p>}
            <p className="relative mt-6 text-[11px] leading-5 text-slate-500">{t('welcome.demoHint')}</p>
          </div>
        </section>
      </main>

      {/*
        Footer: one loud element (the wordmark) and everything else as fine
        print. The policy links stay plain anchors (never onClick buttons) —
        Google's OAuth brand verification reviews the homepage itself, and a
        crawlable href is what both the reviewer and the crawler can follow.
        Keep these hrefs identical to the URLs on the consent screen.
      */}
      <footer className="relative z-10 overflow-hidden border-t border-white/[0.07] px-5 pb-8 pt-10 text-center sm:px-8">
        <p aria-hidden="true" className="select-none bg-gradient-to-b from-white/80 via-white/25 to-transparent bg-clip-text font-heading text-[19vw] font-black leading-[0.82] tracking-[-0.06em] text-transparent sm:text-[13vw] lg:text-[11rem]">
          ECHORA
        </p>
        <div className="mx-auto mt-5 flex max-w-2xl flex-col items-center gap-2 text-[11px] leading-5 text-slate-500">
          <p>
            {t('welcome.footerAttribution')}{' '}
            <a href="https://github.com/chthollyphile/folia-major" target="_blank" rel="noreferrer" className="footer-link underline decoration-white/20 underline-offset-2">folia-major</a>
            <span aria-hidden="true" className="mx-2 text-white/15">·</span>
            <a href="https://github.com/arthurwang110505-debug/echora" target="_blank" rel="noreferrer" className="footer-link inline-flex items-center gap-1"><Code2 aria-hidden="true" className="h-3 w-3" />{t('welcome.openSourceLink')}</a>
          </p>
          <p>{t('welcome.lyricCredit')}</p>
          <nav aria-label={t('welcome.footerNavAria')} className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
            <Link to="/privacy" className="footer-link">{t('welcome.footerPrivacy')}</Link>
            <span aria-hidden="true" className="text-white/15">·</span>
            <Link to="/terms" className="footer-link">{t('welcome.footerTerms')}</Link>
            <span aria-hidden="true" className="text-white/15">·</span>
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="footer-link">{t('welcome.footerYoutubeTerms')}</a>
            <span aria-hidden="true" className="text-white/15">·</span>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="footer-link">{t('welcome.footerGooglePrivacy')}</a>
          </nav>
          <p className="flex items-start justify-center gap-2 text-left">
            <ShieldCheck aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0" style={{ color: 'var(--stage-accent)' }} />
            <span>{t('welcome.footerDataNote')}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
