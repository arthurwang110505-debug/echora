import { X } from 'lucide-react';
import type { Playlist, Song } from '@echora/core';
import { CoverImage } from '../LoadingSkeletons';

const getSourceLabel = (source: Song['source']) => (
  source === 'ytmusic' ? 'YT Music' : source === 'spotify' ? 'Spotify' : '本機音檔'
);

type QueueDrawerProps = {
  playlist: Song[];
  queueLabel: string;
  currentSong: Song;
  isPlaying: boolean;
  userPlaylists: Playlist[];
  activeSource: 'spotify' | 'ytmusic' | 'local';
  spotifyAvailable: boolean;
  onClose: () => void;
  onPlaySong: (song: Song) => void;
  onSetActiveSource: (source: 'spotify' | 'ytmusic' | 'local') => void;
  onLoadPlaylist: (playlist: Playlist) => void;
};

export default function QueueDrawer({
  playlist,
  queueLabel,
  currentSong,
  isPlaying,
  userPlaylists,
  activeSource,
  spotifyAvailable,
  onClose,
  onPlaySong,
  onSetActiveSource,
  onLoadPlaylist,
}: QueueDrawerProps) {
  const sources = spotifyAvailable
    ? (['ytmusic', 'local', 'spotify'] as const)
    : (['ytmusic', 'local'] as const);

  return (
    <>
      <button
        type="button"
        aria-label="關閉歌單面板"
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] md:hidden"
        onClick={onClose}
      />
      <aside
        className="echora-queue fixed inset-y-0 left-0 z-50 flex h-full w-screen min-w-0 flex-col gap-4 overflow-hidden border-r border-white/10 bg-[#0d111a]/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl drawer-slide-left md:relative md:inset-auto md:z-auto md:h-full md:w-96 md:min-w-96 md:flex-shrink-0 md:bg-transparent md:px-5 md:pb-5 md:pt-5 md:shadow-none"
        aria-label="播放清單與歌單"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-white">播放清單</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{playlist.length} 首 · {queueLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="關閉歌單面板"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex rounded-2xl border border-white/10 bg-white/[0.05] p-1">
          {sources.map(src => (
            <button
              type="button"
              key={src}
              onClick={() => onSetActiveSource(src)}
              aria-label={`切換來源至 ${src === 'spotify' ? 'Spotify' : src === 'ytmusic' ? 'YouTube Music' : '本機展示'}`}
              aria-pressed={activeSource === src}
              className={`min-h-11 min-w-0 flex-1 rounded-xl py-2 text-xs font-bold transition-all duration-200 btn-spring ${
                activeSource === src
                  ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {src === 'spotify' ? 'Spotify' : src === 'ytmusic' ? 'YT Music' : '本地'}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          <div>
            <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">目前佇列</h4>
            <div className="space-y-1.5">
              {playlist.map((songItem: Song) => {
                const isItemActive = currentSong.id === songItem.id;
                const itemState = isItemActive ? (isPlaying ? '，播放中' : '，目前選取') : '';
                return (
                  <button
                    type="button"
                    key={songItem.id}
                    onClick={() => onPlaySong(songItem)}
                    aria-current={isItemActive ? 'true' : undefined}
                    aria-label={`${songItem.title}，${getSourceLabel(songItem.source)}${itemState}`}
                    className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition-all duration-200 btn-spring ${
                      isItemActive
                        ? 'border-[#62f5c4]/40 bg-[#62f5c4]/15 text-[#62f5c4] shadow-md'
                        : 'border-transparent text-slate-200 hover:bg-white/[0.06]'
                    }`}
                  >
                    <CoverImage src={songItem.coverUrl} alt={songItem.title} wrapperClassName="h-11 w-11 shrink-0 rounded-xl" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{songItem.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{typeof songItem.artists[0] === 'string' ? songItem.artists[0] : songItem.artists[0]?.name}</p>
                      <span className="mt-1 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{getSourceLabel(songItem.source)}</span>
                    </div>
                    {isItemActive && isPlaying && (
                      <div className="flex shrink-0 items-end gap-0.5 pr-1" aria-label="播放中">
                        <span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {userPlaylists.length > 0 && (
            <div>
              <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">我的歌單</h4>
              <div className="space-y-1.5">
                {userPlaylists.map((pl: Playlist) => (
                  <button
                    type="button"
                    key={pl.id}
                    onClick={() => onLoadPlaylist(pl)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-transparent p-2.5 text-left text-slate-200 transition-all btn-spring hover:bg-white/[0.06]"
                  >
                    <CoverImage src={pl.coverUrl} alt={pl.name} wrapperClassName="h-11 w-11 shrink-0 rounded-xl" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{pl.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{pl.trackCount || 0} 首歌曲</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
