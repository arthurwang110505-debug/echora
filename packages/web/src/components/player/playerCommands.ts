import type { PaletteCommand } from './CommandPalette';

// src/components/player/playerCommands.ts
// Builds the command list for the Ctrl/Cmd+K palette out of the player's live state.
//
// Each command carries its own keyword aliases (Chinese + English) so the matcher stays dumb;
// adding a new surface means adding one entry here and nothing in the palette UI.

export type PlayerCommandContext = {
  t: (key: string, options?: Record<string, unknown>) => string;
  isPlaying: boolean;
  isInStage: boolean;
  isPanelOpen: boolean;
  isDaylight: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekBy: (deltaSeconds: number) => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onToggleMute: () => void;
  onToggleLoop: () => void;
  onTogglePanel: () => void;
  onToggleFullscreen: () => void;
  onToggleTheme: () => void;
  onGenerateAiTheme: () => void;
  onShuffleQueue: () => void;
  onCycleVisualizer: () => void;
  onCycleBackground: () => void;
  onNudgeLyricsEarlier: () => void;
  onNudgeLyricsLater: () => void;
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onOpenHome: () => void;
};

type Entry = {
  id: string;
  titleKey: string;
  groupKey: string;
  keywords: string[];
  run: (ctx: PlayerCommandContext) => void;
};

const ENTRIES: Entry[] = [
  { id: 'play-pause', titleKey: 'panel.commands.playPause', groupKey: 'panel.commands.groupPlayback', keywords: ['播放', '暫停', '播 暂停', 'play', 'pause', 'bofang', 'zanting', 'space'], run: ctx => ctx.onPlayPause() },
  { id: 'next', titleKey: 'panel.commands.next', groupKey: 'panel.commands.groupPlayback', keywords: ['下一首', '下一曲', 'next', 'xiayi', 'xiayishou'], run: ctx => ctx.onNext() },
  { id: 'prev', titleKey: 'panel.commands.prev', groupKey: 'panel.commands.groupPlayback', keywords: ['上一首', '上一曲', 'previous', 'shangyi', 'shangyishou'], run: ctx => ctx.onPrev() },
  { id: 'forward', titleKey: 'panel.commands.forward5', groupKey: 'panel.commands.groupPlayback', keywords: ['快進', '快进', 'forward', 'kuaijin'], run: ctx => ctx.onSeekBy(5) },
  { id: 'back', titleKey: 'panel.commands.back5', groupKey: 'panel.commands.groupPlayback', keywords: ['倒退', '後退', 'rewind', 'back', 'daotui'], run: ctx => ctx.onSeekBy(-5) },
  { id: 'volume-up', titleKey: 'panel.commands.volumeUp', groupKey: 'panel.commands.groupPlayback', keywords: ['音量', '提高音量', 'volume up', 'yinliang'], run: ctx => ctx.onVolumeUp() },
  { id: 'volume-down', titleKey: 'panel.commands.volumeDown', groupKey: 'panel.commands.groupPlayback', keywords: ['音量', '降低音量', 'volume down', 'yinliang'], run: ctx => ctx.onVolumeDown() },
  { id: 'mute', titleKey: 'panel.commands.mute', groupKey: 'panel.commands.groupPlayback', keywords: ['靜音', '静音', 'mute', 'jingyin'], run: ctx => ctx.onToggleMute() },
  { id: 'loop', titleKey: 'panel.commands.loop', groupKey: 'panel.commands.groupPlayback', keywords: ['循環', '循环', '單曲循環', 'loop', 'repeat', 'xunhuan'], run: ctx => ctx.onToggleLoop() },
  { id: 'shuffle', titleKey: 'panel.commands.shuffle', groupKey: 'panel.commands.groupPlayback', keywords: ['隨機', '随机', '洗牌', 'shuffle', 'suiji'], run: ctx => ctx.onShuffleQueue() },

  { id: 'panel', titleKey: 'panel.commands.panel', groupKey: 'panel.commands.groupView', keywords: ['面板', '右側面板', 'panel', 'mianban', 'p'], run: ctx => ctx.onTogglePanel() },
  { id: 'fullscreen', titleKey: 'panel.commands.fullscreen', groupKey: 'panel.commands.groupView', keywords: ['全螢幕', '全屏', '全屏幕', 'fullscreen', 'quanping', 'stage'], run: ctx => ctx.onToggleFullscreen() },
  { id: 'visualizer', titleKey: 'panel.commands.visualizer', groupKey: 'panel.commands.groupView', keywords: ['歌詞動畫', '歌词动画', '視覺', 'visualizer', 'gecidonghua'], run: ctx => ctx.onCycleVisualizer() },
  { id: 'background', titleKey: 'panel.commands.background', groupKey: 'panel.commands.groupView', keywords: ['背景', '背景效果', 'background', 'beijing'], run: ctx => ctx.onCycleBackground() },

  { id: 'theme', titleKey: 'panel.commands.theme', groupKey: 'panel.commands.groupTheme', keywords: ['明暗', '主題', '主题', '深色', '淺色', 'theme', 'dark', 'light', 'zhuti'], run: ctx => ctx.onToggleTheme() },
  { id: 'ai-theme', titleKey: 'panel.commands.aiTheme', groupKey: 'panel.commands.groupTheme', keywords: ['ai', '主題', '主题', '產生', '生成', 'generate theme', 'zhuti'], run: ctx => ctx.onGenerateAiTheme() },

  { id: 'lyrics-earlier', titleKey: 'panel.commands.lyricsEarlier', groupKey: 'panel.commands.groupLyrics', keywords: ['歌詞', '歌词', '提前', '時間軸', '时间轴', 'lyrics earlier', 'geci'], run: ctx => ctx.onNudgeLyricsEarlier() },
  { id: 'lyrics-later', titleKey: 'panel.commands.lyricsLater', groupKey: 'panel.commands.groupLyrics', keywords: ['歌詞', '歌词', '延後', '时间轴', '時間軸', 'lyrics later', 'geci'], run: ctx => ctx.onNudgeLyricsLater() },

  { id: 'settings', titleKey: 'panel.commands.settings', groupKey: 'panel.commands.groupNavigate', keywords: ['設定', '设置', 'settings', 'sheding'], run: ctx => ctx.onOpenSettings() },
  { id: 'library', titleKey: 'panel.commands.library', groupKey: 'panel.commands.groupNavigate', keywords: ['音樂庫', '音乐库', 'library', 'yinyueku'], run: ctx => ctx.onOpenLibrary() },
  { id: 'home', titleKey: 'panel.commands.home', groupKey: 'panel.commands.groupNavigate', keywords: ['歌單', '歌单', '首頁', '首页', 'home', 'gedan'], run: ctx => ctx.onOpenHome() },
];

export function buildPlayerCommands(ctx: PlayerCommandContext): PaletteCommand[] {
  const commands = ENTRIES.map(entry => ({
    id: entry.id,
    title: ctx.t(entry.titleKey),
    group: ctx.t(entry.groupKey),
    keywords: [ctx.t(entry.titleKey), ...entry.keywords],
    run: () => entry.run(ctx),
  }));

  // "Enter fullscreen" and "Leave fullscreen" are one action, labelled for where you are.
  const fullscreen = commands.find(command => command.id === 'fullscreen');
  if (fullscreen) fullscreen.title = ctx.t(ctx.isInStage ? 'panel.commands.exitFullscreen' : 'panel.commands.fullscreen');

  return commands;
}
