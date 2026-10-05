/**
 * Landing → /app hand-off. The landing page performs a demo track and, when
 * the visitor taps 開始體驗, records which song and which second it was at.
 * /app consumes it once so the player continues the same performance.
 */
export const LANDING_HANDOFF_KEY = 'echora:landing-handoff';

export interface LandingHandoff {
  songId: string;
  time: number;
  soundEnabled: boolean;
}

export function writeLandingHandoff(handoff: LandingHandoff): void {
  try {
    window.sessionStorage.setItem(LANDING_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Storage unavailable (private mode): /app still opens the demo catalog.
  }
}

export function consumeLandingHandoff(): LandingHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(LANDING_HANDOFF_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(LANDING_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as Partial<LandingHandoff>;
    if (typeof parsed.songId !== 'string' || typeof parsed.time !== 'number' || !Number.isFinite(parsed.time)) return null;
    return { songId: parsed.songId, time: Math.max(0, parsed.time), soundEnabled: Boolean(parsed.soundEnabled) };
  } catch {
    return null;
  }
}
