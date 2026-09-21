import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ListEnd, ListPlus, Shuffle, Trash2 } from 'lucide-react';
import type { Song } from '@echora/core';
import { CoverImage } from '../../LoadingSkeletons';

// src/components/player/panel/QueueTab.tsx
// 播放佇列 tab. Row layout and the three hover actions are the upstream ones:
// 移動到下一首 / 移動到末尾 / 移除播放列表. The actions are hidden until the row is hovered
// (or focused, for keyboard users) and never swallow the row's play click.

export type QueueTabProps = {
  playlist: Song[];
  currentIndex: number;
  isPlaying: boolean;
  shouldScrollToCurrent: boolean;
  onPlaySong: (song: Song) => void;
  onShuffle: () => void;
  onMoveToNext: (index: number) => void;
  onMoveToEnd: (index: number) => void;
  onRemove: (index: number) => void;
};

const artistLabel = (song: Song) => {
  const first = song.artists[0];
  return typeof first === 'string' ? first : first?.name || '';
};

export default function QueueTab({
  playlist,
  currentIndex,
  isPlaying,
  shouldScrollToCurrent,
  onPlaySong,
  onShuffle,
  onMoveToNext,
  onMoveToEnd,
  onRemove,
}: QueueTabProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const lastScrolledRef = useRef(-1);

  // Keep the playing row in view; only scroll when the index actually moves so a hover
  // action that reorders rows underneath the pointer does not yank the list around.
  useEffect(() => {
    if (!shouldScrollToCurrent || currentIndex < 0) return;
    if (lastScrolledRef.current === currentIndex) return;
    lastScrolledRef.current = currentIndex;
    rowRefs.current.get(currentIndex)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex, shouldScrollToCurrent, playlist.length]);

  useEffect(() => () => rowRefs.current.clear(), []);

  if (playlist.length === 0) {
    return (
      <div className="flex h-full max-h-[300px] select-none flex-col">
        <div className="flex h-full items-center justify-center text-xs opacity-40">{t('panel.queueEmpty')}</div>
      </div>
    );
  }

  const actions = [
    { label: t('panel.playNext'), Icon: ListPlus, run: onMoveToNext },
    { label: t('panel.moveToEnd'), Icon: ListEnd, run: onMoveToEnd },
    { label: t('panel.remove'), Icon: Trash2, run: onRemove },
  ];

  return (
    <div className="flex h-full max-h-[300px] select-none flex-col">
      <div className="flex shrink-0 items-center justify-between px-2 pb-2">
        <span className="text-xs font-medium opacity-60">
          {t('panel.queueTitle')} ({playlist.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onShuffle}
            title={t('panel.shuffle')}
            aria-label={t('panel.shuffle')}
            className="rounded-md p-1.5 opacity-60 transition-colors hover:bg-white/10 hover:opacity-100"
          >
            <Shuffle aria-hidden="true" size={14} />
          </button>
        </div>
      </div>

      <p className="px-2 pb-1.5 text-[10px] opacity-35">{t('panel.queueRowHint')}</p>

      <div ref={listRef} className="-mx-2 flex-1 overflow-y-auto px-2">
        {playlist.map((song, index) => {
          const isActive = index === currentIndex;
          return (
            <div
              key={`${song.source}:${song.id}:${index}`}
              ref={node => {
                if (node) rowRefs.current.set(index, node);
                else rowRefs.current.delete(index);
              }}
              role="button"
              tabIndex={0}
              onClick={() => onPlaySong(song)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPlaySong(song);
                }
              }}
              aria-current={isActive ? 'true' : undefined}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                isActive ? 'bg-white/20' : 'hover:bg-white/5'
              }`}
            >
              <div className={`h-6 w-1 shrink-0 rounded-full ${isActive ? 'bg-white' : 'bg-transparent'}`} aria-hidden="true" />
              <CoverImage
                src={song.coverUrl}
                alt={song.title}
                wrapperClassName="h-8 w-8 shrink-0 rounded-md"
                className="h-8 w-8 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-xs font-medium ${isActive ? 'text-[#b8ffe2]' : ''}`}>{song.title}</div>
                <div className="truncate text-[10px] opacity-40">
                  {artistLabel(song)}
                  {isActive && isPlaying ? ` · ${t('player.playing')}` : ''}
                </div>
              </div>
              {/* Invisible rows must not be click targets; keyboard focus re-reveals them. */}
              <div className="pointer-events-none flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                {actions.map(({ label, Icon, run }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={event => {
                      event.stopPropagation();
                      // Keyboard activation must not leave focus on a button that is about
                      // to be re-rendered away by the very action it triggered.
                      if (event.detail > 0) event.currentTarget.blur();
                      run(index);
                    }}
                    className="rounded-md p-1.5 transition-colors hover:bg-white/10"
                  >
                    <Icon aria-hidden="true" size={13} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
