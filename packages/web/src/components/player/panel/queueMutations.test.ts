import { describe, expect, it } from 'vitest';
import { moveSongToEnd, moveSongToNext, removeSongAt, shuffleQueue } from './queueMutations';

const queue = ['a', 'b', 'c', 'd', 'e'];

describe('queue mutations', () => {
  it('moves a row directly after the playing one', () => {
    // 'a' is playing; dragging 'd' to "next" lands it at index 1.
    const result = moveSongToNext(queue, 0, 3);
    expect(result.changed).toBe(true);
    expect(result.playlist).toEqual(['a', 'd', 'b', 'c', 'e']);
    expect(result.playlist[result.currentIndex]).toBe('a');
  });

  it('compensates the removal shift when the dragged row sits before the playing one', () => {
    // 'c' is playing (index 2); dragging 'a' to "next" must end up right after 'c'.
    const result = moveSongToNext(queue, 2, 0);
    expect(result.playlist).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(result.playlist[result.currentIndex]).toBe('c');
  });

  it('refuses a no-op "move to next" for the playing row or its neighbour', () => {
    expect(moveSongToNext(queue, 1, 1).changed).toBe(false);
    expect(moveSongToNext(queue, 1, 2).changed).toBe(false);
    expect(moveSongToNext(queue, 1, 9).changed).toBe(false);
  });

  it('moves a row to the end, and treats the last row as a no-op', () => {
    expect(moveSongToEnd(queue, 0, 1).playlist).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(moveSongToEnd(queue, 0, 4).changed).toBe(false);
    expect(moveSongToEnd(queue, 0, -1).changed).toBe(false);
  });

  it('keeps the highlight on the same song when rows move around it', () => {
    const result = moveSongToEnd(queue, 1, 0);
    expect(result.playlist).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(result.currentIndex).toBe(0);
    expect(result.playlist[result.currentIndex]).toBe('b');
  });

  it('removes a row and re-points the playing index at the same song', () => {
    const result = removeSongAt(queue, 2, 0);
    expect(result.playlist).toEqual(['b', 'c', 'd', 'e']);
    expect(result.currentIndex).toBe(1);
    expect(result.playlist[result.currentIndex]).toBe('c');
  });

  it('clamps the playing index when the playing row itself is removed', () => {
    const result = removeSongAt(queue, 4, 4);
    expect(result.playlist).toEqual(['a', 'b', 'c', 'd']);
    expect(result.currentIndex).toBe(3);
  });

  it('ignores out-of-range removals', () => {
    expect(removeSongAt(queue, 0, 7).changed).toBe(false);
    expect(removeSongAt(queue, 0, -1).changed).toBe(false);
  });

  it('shuffles but keeps the playing row where it was', () => {
    // A deterministic "random" that always returns 0 swaps each slot with the first one.
    const result = shuffleQueue(queue, 2, () => 0);
    expect(result.changed).toBe(true);
    expect(result.playlist[result.currentIndex]).toBe('c');
    expect([...result.playlist].sort()).toEqual([...queue].sort());
  });

  it('does not shuffle a queue with fewer than two rows', () => {
    expect(shuffleQueue(['a'], 0).changed).toBe(false);
    expect(shuffleQueue([], 0).changed).toBe(false);
  });
});
