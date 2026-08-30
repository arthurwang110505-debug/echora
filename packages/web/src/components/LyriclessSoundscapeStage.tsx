import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { resolveStageAudioBands } from '../playback/audioBands';
import { sampleLocalAudioBands } from '../playback/localAudioAnalyser';
import { CoverImage } from './LoadingSkeletons';

type SoundscapeTheme = {
  backgroundColor?: string;
  primaryColor?: string;
  accentColor?: string;
  secondaryColor?: string;
};

interface Props {
  coverUrl?: string;
  songTitle: string;
  songArtist: string;
  displayedTime: number;
  isPlaying: boolean;
  theme: SoundscapeTheme;
}

const PARTICLES = [
  { left: '12%', top: '21%', size: 3, delay: '0s' },
  { left: '22%', top: '66%', size: 2, delay: '-2.2s' },
  { left: '34%', top: '15%', size: 4, delay: '-4.6s' },
  { left: '69%', top: '19%', size: 2, delay: '-1.6s' },
  { left: '82%', top: '39%', size: 3, delay: '-3.4s' },
  { left: '73%', top: '76%', size: 4, delay: '-5.2s' },
  { left: '50%', top: '84%', size: 2, delay: '-6.4s' },
  { left: '17%', top: '42%', size: 2, delay: '-7.8s' },
];

export default function LyriclessSoundscapeStage({ coverUrl, songTitle, songArtist, displayedTime, isPlaying, theme }: Props) {
  const accent = theme.accentColor || '#62f5c4';
  const primary = theme.primaryColor || '#6366f1';
  const secondary = theme.secondaryColor || '#22d3ee';
  const background = theme.backgroundColor || '#07090e';
  const bands = resolveStageAudioBands({
    isPlaying,
    displayedTime,
    liveBands: sampleLocalAudioBands(isPlaying),
  });
  const pulse = isPlaying ? 0.48 + bands.bass * 0.42 : 0.28;

  const bars = useMemo(() => Array.from({ length: 19 }, (_, index) => {
    const mix = index % 3 === 0 ? bands.bass : index % 3 === 1 ? bands.mid : bands.treble;
    const wave = Math.abs(Math.sin(index * 0.78 + displayedTime * 2.4));
    return Math.round(isPlaying ? 12 + mix * 54 + wave * 8 : 12);
  }), [bands.bass, bands.mid, bands.treble, displayedTime, isPlaying]);

  const rootStyle = {
    '--soundscape-accent': accent,
    '--soundscape-primary': primary,
    '--soundscape-secondary': secondary,
    '--soundscape-pulse': pulse,
    backgroundColor: background,
  } as CSSProperties;

  return (
    <section className="soundscape-stage" style={rootStyle} aria-label={`${songTitle} 無歌詞聲景舞台`}>
      <div className="soundscape-backdrop" aria-hidden="true">
        {coverUrl && <img src={coverUrl} alt="" className="soundscape-backdrop-art" />}
        <div className="soundscape-wash" />
        <div className="soundscape-glow soundscape-glow-primary" />
        <div className="soundscape-glow soundscape-glow-secondary" />
      </div>

      <div className="soundscape-particles" aria-hidden="true">
        {PARTICLES.map((particle, index) => (
          <span
            key={index}
            className="soundscape-particle"
            style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size, animationDelay: particle.delay }}
          />
        ))}
      </div>

      <div className="soundscape-content">
        <div className="soundscape-kicker"><span className="soundscape-kicker-dot" /> Echora Soundscape <span className="soundscape-kicker-divider" /> 無同步歌詞</div>
        <div className={`soundscape-artwork-shell ${isPlaying ? 'soundscape-is-playing' : 'soundscape-is-paused'}`}>
          <div className="soundscape-orbit soundscape-orbit-outer" aria-hidden="true" />
          <div className="soundscape-orbit soundscape-orbit-inner" aria-hidden="true" />
          <div className="soundscape-artwork-frame">
            {coverUrl ? <CoverImage src={coverUrl} alt={`${songTitle} 封面`} wrapperClassName="echora-soundscape-artwork-media" className="soundscape-artwork" /> : <div className="soundscape-artwork-fallback">E</div>}
            <div className="soundscape-artwork-shine" aria-hidden="true" />
          </div>
        </div>
        <div className="soundscape-copy">
          <p className="soundscape-eyebrow">純音樂 · 背景音樂 · 讓畫面跟著聲音呼吸</p>
          <h2>{songTitle}</h2>
          <p>{songArtist}</p>
        </div>
        <div className="soundscape-waveform" aria-label={isPlaying ? '聲景脈動中' : '聲景已暫停'} role="img">
          {bars.map((height, index) => <span key={index} style={{ height: `${height}px`, animationDelay: `${index * -0.08}s` }} />)}
        </div>
        <p className="soundscape-status">{isPlaying ? '正在播放，光影會隨音樂緩慢流動' : '按下播放，讓聲景舞台開始呼吸'}</p>
      </div>
    </section>
  );
}
