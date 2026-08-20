export type DiagnosticEventName = 'song_selected' | 'play_requested' | 'pause_requested' | 'youtube_error' | 'render_error';

export interface DiagnosticEvent {
  id: number;
  name: DiagnosticEventName;
  createdAt: number;
  details: Record<string, string | number | boolean>;
}

const STORAGE_KEY = 'echora.diagnostics.v1';
const MAX_EVENTS = 30;

export function readDiagnosticEvents(): DiagnosticEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(name: DiagnosticEventName, details: DiagnosticEvent['details'] = {}) {
  if (typeof window === 'undefined') return;
  const event: DiagnosticEvent = { id: Date.now(), name, createdAt: Date.now(), details };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([event, ...readDiagnosticEvents()].slice(0, MAX_EVENTS)));
  } catch {
    // Diagnostics must never block playback or recovery when browser storage is unavailable.
  }
}

export function clearDiagnosticEvents() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}
