// src/components/player/panel/queueMutations.ts
// Pure queue edits for the 播放队列 tab: 移動到下一首 / 移動到末尾 / 移除播放列表.
//
// Ported semantics from upstream Folia (`createQueueMutations`):
//   - "move to next" inserts right after the currently playing row, compensating for the
//     removal shift when the dragged row sits before the current one;
//   - "move to end" is a no-op when the row is already last;
//   - out-of-range indices never mutate.
// Keeping them pure (no store access) is what makes them unit-testable.

export type QueueEditResult<T> = {
  playlist: T[];
  currentIndex: number;
  changed: boolean;
};

const noChange = <T,>(playlist: T[], currentIndex: number): QueueEditResult<T> => ({
  playlist,
  currentIndex,
  changed: false,
});

const clampIndex = (index: number, length: number) => (length <= 0 ? 0 : Math.min(Math.max(index, 0), length - 1));

/**
 * Re-locates the playing row after an edit by object identity, so the highlight and the
 * next/prev math stay attached to the same song no matter how rows moved. Falls back to the
 * clamped old index when the playing row was the one that got removed.
 */
const resolveCurrentIndex = <T,>(next: T[], playingRow: T | undefined, previousIndex: number) => {
  if (playingRow === undefined) return clampIndex(previousIndex, next.length);
  const found = next.indexOf(playingRow);
  return found >= 0 ? found : clampIndex(previousIndex, next.length);
};

export function removeSongAt<T>(playlist: T[], currentIndex: number, index: number): QueueEditResult<T> {
  if (index < 0 || index >= playlist.length) return noChange(playlist, currentIndex);
  const playingRow = playlist[currentIndex];
  const next = playlist.filter((_, songIndex) => songIndex !== index);
  return { playlist: next, currentIndex: resolveCurrentIndex(next, playingRow, currentIndex), changed: true };
}

export function moveSongToEnd<T>(playlist: T[], currentIndex: number, index: number): QueueEditResult<T> {
  if (index < 0 || index >= playlist.length - 1) return noChange(playlist, currentIndex);
  const playingRow = playlist[currentIndex];
  const next = [...playlist];
  const [song] = next.splice(index, 1);
  next.push(song);
  return { playlist: next, currentIndex: resolveCurrentIndex(next, playingRow, currentIndex), changed: true };
}

export function moveSongToNext<T>(playlist: T[], currentIndex: number, index: number): QueueEditResult<T> {
  const targetIndex = Math.min(currentIndex + 1, playlist.length - 1);
  if (index < 0 || index >= playlist.length || index === targetIndex || index === currentIndex) {
    return noChange(playlist, currentIndex);
  }
  const playingRow = playlist[currentIndex];
  const next = [...playlist];
  const [song] = next.splice(index, 1);
  // Rows before the target shift left by one once the row is lifted out.
  const adjustedTargetIndex = index < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(adjustedTargetIndex, 0, song);
  return { playlist: next, currentIndex: resolveCurrentIndex(next, playingRow, currentIndex), changed: true };
}

/** Fisher-Yates shuffle that keeps the playing row pinned at its slot. */
export function shuffleQueue<T>(playlist: T[], currentIndex: number, random: () => number = Math.random): QueueEditResult<T> {
  if (playlist.length < 2) return noChange(playlist, currentIndex);
  const playingRow = playlist[currentIndex];
  const next = [...playlist];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return { playlist: next, currentIndex: resolveCurrentIndex(next, playingRow, currentIndex), changed: true };
}
