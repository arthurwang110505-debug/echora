export type DiagnosticEventName = 'song_selected' | 'play_requested' | 'pause_requested' | 'youtube_error' | 'render_error' | 'web_vital';

const diagnosticLabels: Record<DiagnosticEventName, string> = {
  song_selected: '已選取歌曲',
  play_requested: '已要求播放',
  pause_requested: '已要求暫停',
  youtube_error: 'YouTube 播放器錯誤',
  render_error: '畫面載入錯誤',
  web_vital: '網頁效能指標',
};

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

export function getDiagnosticLabel(name: DiagnosticEventName) {
  return diagnosticLabels[name];
}

export function createDiagnosticSummary(events: DiagnosticEvent[]) {
  if (!events.length) return '';
  const formatter = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'medium' });
  const lines = events.slice(0, MAX_EVENTS).map(event => `- ${formatter.format(event.createdAt)}：${getDiagnosticLabel(event.name)}`);
  return ['Echora 本機診斷摘要', '僅包含時間與事件類型；不含帳號、token、歌名或歌詞。', ...lines].join('\n');
}
