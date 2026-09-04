import { describe, expect, it } from "vitest";
import { SonnetSceneSchedule } from "./sonnetSceneSchedule";
import type { SonnetParagraph } from "./types";

const paragraphs = (count: number, duration = 10): SonnetParagraph[] =>
  Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `p-${index}`,
        startTime: index * duration,
        endTime: (index + 1) * duration,
      }) as SonnetParagraph,
  );

describe("SonnetSceneSchedule", () => {
  it("orders active paragraph first, then neighbours, then lookahead", () => {
    const schedule = new SonnetSceneSchedule();
    schedule.rescheduleAround(2, paragraphs(10), 25, 100);

    const order: number[] = [];
    let task = schedule.pop();
    while (task) {
      order.push(task.index);
      task = schedule.pop();
    }

    // Active (tier 0) first.
    expect(order[0]).toBe(2);
    // Neighbours (tier 1) before distant lookahead (tier 2).
    expect(order.slice(1, 3).sort((a, b) => a - b)).toEqual([1, 3]);
    // Everything remaining is a later paragraph, ascending by start time.
    const rest = order.slice(3);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
    // Only upcoming paragraphs within the lookahead window are queued.
    expect(order).not.toContain(0);
    expect(order).toContain(9);
  });

  it("drops paragraphs behind playback and outside the lookahead window on reschedule", () => {
    const schedule = new SonnetSceneSchedule();
    schedule.rescheduleAround(8, paragraphs(12), 85, 20);

    const indexes: number[] = [];
    let task = schedule.pop();
    while (task) {
      indexes.push(task.index);
      task = schedule.pop();
    }

    expect(indexes).toContain(8); // active
    expect(indexes).toContain(9); // neighbour
    expect(indexes).toContain(10); // within lookahead window (startTime 100 <= 105)
    expect(indexes).not.toContain(11); // startTime 110 > 105
    expect(indexes.some((i) => i < 7)).toBe(false); // everything far behind is dropped
  });

  it("never downgrades urgency when a queued task becomes the active paragraph (seek)", () => {
    const schedule = new SonnetSceneSchedule();
    schedule.rescheduleAround(1, paragraphs(6), 15, 100);

    // Seek forward: paragraph 5 was a tier-2 lookahead task, now active.
    schedule.rescheduleAround(5, paragraphs(6), 55, 100);
    const first = schedule.peek();
    expect(first?.index).toBe(5);
    expect(first?.tier).toBe(0);
    // Stale far-behind tasks from the old plan are gone.
    let contains = false;
    let task = schedule.pop();
    while (task) {
      if (task.index === 0) contains = true;
      task = schedule.pop();
    }
    expect(contains).toBe(false);
  });

  it("request() upgrades tier but does not downgrade", () => {
    const schedule = new SonnetSceneSchedule();
    schedule.request(3, 2, 30);
    schedule.request(3, 0, 30); // upgrade
    expect(schedule.peek()?.tier).toBe(0);
    schedule.request(3, 1, 30); // cannot downgrade back
    expect(schedule.peek()?.tier).toBe(0);
  });

  it("delete() removes a task that got built synchronously", () => {
    const schedule = new SonnetSceneSchedule();
    schedule.request(0, 0, 0);
    schedule.delete(0);
    expect(schedule.size).toBe(0);
    expect(schedule.peek()).toBeNull();
  });

  it("clear() empties the queue", () => {
    const schedule = new SonnetSceneSchedule();
    schedule.rescheduleAround(0, paragraphs(4), 0, 100);
    expect(schedule.size).toBeGreaterThan(0);
    schedule.clear();
    expect(schedule.size).toBe(0);
  });
});
