import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LyriclessSoundscapeStage from './LyriclessSoundscapeStage';

describe('LyriclessSoundscapeStage', () => {
  it('renders an atmospheric fallback for music without synced lyrics', () => {
    const markup = renderToStaticMarkup(
      <LyriclessSoundscapeStage
        coverUrl="https://example.com/lofi-cover.jpg"
        songTitle="Midnight Lo-fi"
        songArtist="Echora Sessions"
        displayedTime={42}
        isPlaying
        theme={{
          backgroundColor: '#07090e',
          primaryColor: '#6366f1',
          accentColor: '#62f5c4',
          secondaryColor: '#22d3ee',
        }}
      />,
    );

    expect(markup).toContain('soundscape-stage');
    expect(markup).toContain('Echora Soundscape');
    expect(markup).toContain('無同步歌詞');
    expect(markup).toContain('Midnight Lo-fi');
    expect(markup).toContain('soundscape-waveform');
    expect(markup).toContain('soundscape-backdrop-art');
  });

  it('exposes a paused status when playback is stopped', () => {
    const markup = renderToStaticMarkup(
      <LyriclessSoundscapeStage
        songTitle="Quiet Jazz Room"
        songArtist="Echora Sessions"
        displayedTime={0}
        isPlaying={false}
        theme={{}}
      />,
    );

    expect(markup).toContain('按下播放，讓聲景舞台開始呼吸');
    expect(markup).toContain('soundscape-is-paused');
  });
});
