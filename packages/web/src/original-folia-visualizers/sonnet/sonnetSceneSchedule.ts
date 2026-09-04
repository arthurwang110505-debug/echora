import type { SonnetParagraph } from "./types";

// src/components/visualizer/sonnet/sonnetSceneSchedule.ts
// Pure scheduling for time-sliced Sonnet scene construction. Kept free of Pixi
// so the pre-build queue ordering can be unit tested without a renderer.

export interface SonnetSceneTask {
  /** Paragraph index this task builds. */
  index: number;
  /**
   * Priority class: the active (visible) paragraph must build first, its
   * neighbours second (needed for transitions and the ±1 scene guarantee),
   * then lookahead paragraphs in playback order.
   */
  tier: 0 | 1 | 2;
  /** Absolute playback time (seconds) at which the paragraph starts. */
  startTime: number;
  /** Monotonic insertion sequence; breaks ties so playback order wins. */
  seq: number;
}

/**
 * Keeps pending scene-build tasks ordered so the ticker drains the most urgent
 * work within its per-frame time budget:
 *  - tier 0: the currently visible paragraph (or its immediate target on seek)
 *  - tier 1: paragraphs directly before/after the visible one
 *  - tier 2: upcoming paragraphs within the lookahead window, in playback order
 */
export class SonnetSceneSchedule {
  private tasks = new Map<number, SonnetSceneTask>();
  private seqCounter = 0;

  get size(): number {
    return this.tasks.size;
  }

  has(index: number): boolean {
    return this.tasks.has(index);
  }

  clear(): void {
    this.tasks.clear();
  }

  /**
   * Adds or upgrades a task. A task never downgrades (e.g. a lookahead task
   * that becomes a neighbour/active task keeps the higher urgency), and its
   * start time is refreshed so ordering stays correct after a seek.
   */
  request(
    index: number,
    tier: SonnetSceneTask["tier"],
    startTime: number,
  ): void {
    if (!Number.isFinite(index) || index < 0) return;
    const existing = this.tasks.get(index);
    if (existing) {
      const nextTier = Math.min(existing.tier, tier) as SonnetSceneTask["tier"];
      if (nextTier === existing.tier && existing.startTime === startTime)
        return;
      existing.tier = nextTier;
      existing.startTime = startTime;
      return;
    }
    this.tasks.set(index, {
      index,
      tier,
      startTime,
      seq: this.seqCounter++,
    });
  }

  /**
   * Rebuilds the desired task set around the active paragraph and drops any
   * pending work that is no longer relevant (far behind playback or outside
   * the lookahead window). Called on every paragraph change and on seeks.
   */
  rescheduleAround(
    activeIndex: number,
    paragraphs: ReadonlyArray<Pick<SonnetParagraph, "startTime" | "endTime">>,
    currentTime: number,
    lookaheadSeconds: number,
  ): void {
    const wanted = new Set<number>();
    for (let index = 0; index < paragraphs.length; index += 1) {
      const paragraph = paragraphs[index];
      if (!paragraph) continue;
      if (index === activeIndex) {
        wanted.add(index);
        continue;
      }
      const isNeighbour =
        index === activeIndex - 1 || index === activeIndex + 1;
      if (isNeighbour) {
        wanted.add(index);
        continue;
      }
      // Upcoming paragraphs inside the lookahead window. Paragraphs far
      // behind playback are dropped; far-ahead ones wait for later ticks.
      if (
        index > activeIndex &&
        paragraph.startTime <= currentTime + lookaheadSeconds
      ) {
        wanted.add(index);
      }
    }

    for (const index of [...this.tasks.keys()]) {
      if (!wanted.has(index)) this.tasks.delete(index);
    }

    for (const index of wanted) {
      const paragraph = paragraphs[index];
      if (!paragraph) continue;
      const tier: SonnetSceneTask["tier"] =
        index === activeIndex ? 0 : Math.abs(index - activeIndex) <= 1 ? 1 : 2;
      this.request(index, tier, paragraph.startTime);
    }
  }

  /**
   * Returns the next task to build (highest tier, then earliest start time,
   * then insertion order) without removing it. `pop` removes it.
   */
  peek(): SonnetSceneTask | null {
    let best: SonnetSceneTask | null = null;
    for (const task of this.tasks.values()) {
      if (
        !best ||
        task.tier < best.tier ||
        (task.tier === best.tier && task.startTime < best.startTime) ||
        (task.tier === best.tier &&
          task.startTime === best.startTime &&
          task.seq < best.seq)
      ) {
        best = task;
      }
    }
    return best;
  }

  pop(): SonnetSceneTask | null {
    const best = this.peek();
    if (best) this.tasks.delete(best.index);
    return best;
  }

  /** Removes a finished/cancelled task (e.g. a scene that got built synchronously). */
  delete(index: number): void {
    this.tasks.delete(index);
  }
}
