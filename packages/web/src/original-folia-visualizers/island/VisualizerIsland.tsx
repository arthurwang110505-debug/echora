// src/original-folia-visualizers/island/VisualizerIsland.tsx
//
// 靈動詞島 as a stage mode.
//
// The island is a readout, not a scene: there is no Pixi runtime, no scene director, and nothing to
// compile per song. Making it a visualizer mode is mostly a question of giving it a stage-sized
// presence without changing what it is - so the same component runs at `regular` size, centred over
// the shared shell, while the shell keeps owning the background and the back button.
//
// The subtitle overlay is deliberately NOT mounted here. Every other mode mounts it because the
// scene carries the main lyric and the overlay carries the translation; the island already carries
// both, and stacking the two would print every line twice.

import React from 'react';
import type { VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import LyricsIsland from './LyricsIsland';

const VisualizerIsland: React.FC<VisualizerSharedProps> = (props) => {
  const {
    currentTime,
    currentLineIndex,
    lines,
    theme,
    audioPower,
    audioBands,
    paused = false,
    onLyricLineSeek,
    isPreviewMode = false,
    islandTuning,
  } = props;

  return (
    <VisualizerShell
      theme={theme}
      audioPower={audioPower}
      audioBands={audioBands}
      sharedProps={props}
    >
      {/* Hung from the top edge, centred - the island's whole point is that it sits where a phone's
          Dynamic Island does, not in the middle of the frame. `items-start` keeps it there when the
          card is short; the wrapper is pointer-transparent so stage clicks still land. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-6"
        style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
      >
        <LyricsIsland
          currentTime={currentTime}
          currentLineIndex={currentLineIndex}
          lines={lines}
          theme={theme}
          coverUrl={props.coverUrl}
          size={isPreviewMode ? 'compact' : 'regular'}
          paused={paused}
          onSeekLine={onLyricLineSeek}
          tuning={islandTuning}
        />
      </div>
    </VisualizerShell>
  );
};

export default VisualizerIsland;
