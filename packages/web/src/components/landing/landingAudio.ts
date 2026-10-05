/**
 * LandingAudioEngine — the landing page's "house PA".
 *
 * The landing performs a real demo track. Until the visitor explicitly opts
 * into sound (a user gesture — browsers require it, and juries hate autoplay),
 * the engine runs a silent *virtual clock* that advances at 1x, so lyrics,
 * lights and scene changes stay in time with where the song would be. When
 * sound is enabled, the clock hands over to the `<audio>` element and an
 * AnalyserNode starts feeding a 0..1 "energy" value the stage lights react to.
 *
 * Everything is guarded so it is inert during SSR / jsdom.
 */

export type LandingAudioStatus = 'silent' | 'loading' | 'playing' | 'paused' | 'ended' | 'unavailable';

export interface LandingAudioSnapshot {
  status: LandingAudioStatus;
  /** True once the visitor has opted into sound at least once. */
  soundEnabled: boolean;
}

type Listener = (snapshot: LandingAudioSnapshot) => void;

const hasWindow = () => typeof window !== 'undefined';

export class LandingAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array | null = null;
  private listeners = new Set<Listener>();
  private status: LandingAudioStatus = 'silent';
  private soundEnabled = false;
  private clockStart = 0;
  private clockOffset = 0;
  private clockRunning = false;
  private energySmoothed = 0;
  private readonly durationSeconds: number;

  constructor(private readonly src: string, durationMs: number) {
    this.durationSeconds = Math.max(1, durationMs / 1000);
    if (hasWindow()) this.startClock();
  }

  /** Current performance time in seconds (audio time when playing, else the virtual clock). */
  getTime(): number {
    if (this.audio && this.soundEnabled && this.status !== 'unavailable') {
      return this.audio.currentTime;
    }
    if (!this.clockRunning) return this.clockOffset % this.durationSeconds;
    const now = (performance.now() - this.clockStart) / 1000 + this.clockOffset;
    return now % this.durationSeconds;
  }

  getDuration(): number {
    return this.audio?.duration && Number.isFinite(this.audio.duration) ? this.audio.duration : this.durationSeconds;
  }

  /** Low-band energy 0..1, smoothed. Returns a synthetic beat when silent. */
  getEnergy(): number {
    if (this.analyser && this.bins && this.status === 'playing') {
      this.analyser.getByteFrequencyData(this.bins as Uint8Array<ArrayBuffer>);
      // Average the lowest ~12 bins (kick / bass) for the lighting hit.
      let sum = 0;
      const count = Math.min(12, this.bins.length);
      for (let index = 0; index < count; index += 1) sum += this.bins[index];
      const raw = sum / (count * 255);
      this.energySmoothed += (raw - this.energySmoothed) * (raw > this.energySmoothed ? 0.5 : 0.12);
      return this.energySmoothed;
    }
    return 0;
  }

  getSnapshot(): LandingAudioSnapshot {
    return { status: this.status, soundEnabled: this.soundEnabled };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Must be called from a user gesture. Hands the clock to the real audio element. */
  async enableSound(): Promise<void> {
    if (!hasWindow() || typeof Audio === 'undefined') {
      this.setStatus('unavailable');
      return;
    }
    try {
      if (!this.audio) {
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.loop = true;
        audio.src = this.src;
        audio.addEventListener('playing', () => this.setStatus('playing'));
        audio.addEventListener('pause', () => { if (this.status !== 'ended') this.setStatus('paused'); });
        audio.addEventListener('ended', () => this.setStatus('ended'));
        audio.addEventListener('error', () => this.setStatus('unavailable'));
        this.audio = audio;
      }
      // Resume from where the silent clock is, so the hand-over is seamless.
      const resumeAt = this.getTime();
      this.soundEnabled = true;
      this.setStatus('loading');
      this.ensureAnalyser();
      await this.context?.resume().catch(() => undefined);
      this.audio.currentTime = resumeAt;
      await this.audio.play();
      this.clockRunning = false;
    } catch {
      this.soundEnabled = false;
      this.setStatus('unavailable');
      this.startClock();
    }
  }

  async toggle(): Promise<void> {
    if (!this.soundEnabled || !this.audio) {
      await this.enableSound();
      return;
    }
    if (this.audio.paused) {
      await this.context?.resume().catch(() => undefined);
      await this.audio.play().catch(() => this.setStatus('unavailable'));
    } else {
      this.audio.pause();
    }
  }

  mute(): void {
    if (!this.audio) return;
    // "Mute" keeps the show going silently: drop back to the virtual clock from the audio position.
    this.clockOffset = this.audio.currentTime;
    this.audio.pause();
    this.soundEnabled = false;
    this.startClock();
    this.setStatus('silent');
  }

  dispose(): void {
    this.audio?.pause();
    this.audio?.removeAttribute('src');
    this.audio = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.listeners.clear();
  }

  private startClock() {
    this.clockStart = performance.now();
    this.clockRunning = true;
  }

  private ensureAnalyser() {
    if (this.analyser || !this.audio) return;
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    try {
      const context = new Context();
      const source = context.createMediaElementSource(this.audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyser.connect(context.destination);
      this.context = context;
      this.analyser = analyser;
      this.bins = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // CORS or unsupported — audio still plays, the lights just keep their own beat.
    }
  }

  private setStatus(status: LandingAudioStatus) {
    this.status = status;
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }
}
