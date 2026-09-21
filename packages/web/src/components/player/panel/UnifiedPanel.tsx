import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Disc, FileText, Home, ListMusic, MirrorRectangular, Settings, SlidersHorizontal, Star, User as UserIcon } from 'lucide-react';
import type { Song, ThemeConfig } from '@echora/core';
import { CoverImage } from '../../LoadingSkeletons';
import SongInfoTab from './SongInfoTab';
import LyricsTab, { type LyricsTabProps } from './LyricsTab';
import ControlsTab, { type ControlsTabProps } from './ControlsTab';
import QueueTab, { type QueueTabProps } from './QueueTab';
import AccountTab, { type AccountTabProps } from './AccountTab';
import ThemeQuickEditor from './ThemeQuickEditor';

// src/components/player/panel/UnifiedPanel.tsx
// Echora port of upstream Folia's UnifiedPanel — the floating glass card anchored to the
// bottom-right of 播放頁面: square cover with four hover corner buttons, an icon-only tab
// switcher, and the tab body. Tab order and icons match the guide's "中間一排圖標從左到右":
// 歌曲資訊 → 歌詞資訊 → 播放控制 → 播放佇列 → 帳戶資訊.

export type PanelTab = 'cover' | 'lyrics' | 'controls' | 'queue' | 'account';

const TABS: { id: PanelTab; labelKey: string; Icon: typeof Disc }[] = [
  { id: 'cover', labelKey: 'panel.tabCover', Icon: Disc },
  { id: 'lyrics', labelKey: 'panel.tabLyrics', Icon: FileText },
  { id: 'controls', labelKey: 'panel.tabControls', Icon: SlidersHorizontal },
  { id: 'queue', labelKey: 'panel.tabQueue', Icon: ListMusic },
  { id: 'account', labelKey: 'panel.tabAccount', Icon: UserIcon },
];

type UnifiedPanelProps = {
  isOpen: boolean;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  song: Song | null;
  isLiked: boolean;
  onToggleLike: () => void;
  transparentBackground: boolean;
  onToggleTransparentBackground: () => void;
  onOpenSettings: () => void;
  onBackHome: () => void;
  lyrics: LyricsTabProps;
  controls: ControlsTabProps;
  queue: QueueTabProps;
  account: AccountTabProps;
  themeQuickEditorTheme: ThemeConfig | null;
  onCloseThemeQuickEditor: () => void;
  onSaveTheme: (theme: ThemeConfig) => void;
};

const CORNER_BUTTON = 'flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/25 text-white/90 backdrop-blur-md transition-all hover:bg-black/40 hover:text-white';

export default function UnifiedPanel({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  song,
  isLiked,
  onToggleLike,
  transparentBackground,
  onToggleTransparentBackground,
  onOpenSettings,
  onBackHome,
  lyrics,
  controls,
  queue,
  account,
  themeQuickEditorTheme,
  onCloseThemeQuickEditor,
  onSaveTheme,
}: UnifiedPanelProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape closes the quick editor first, then the panel — innermost surface wins.
      if (event.key === 'Escape' && !themeQuickEditorTheme) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, themeQuickEditorTheme]);

  if (!isOpen) return null;

  return (
    <>
      <div
        data-testid="unified-panel-surface"
        role="region"
        aria-label={t('panel.panelAria')}
        className="pointer-events-auto absolute bottom-20 right-4 z-[60] flex max-h-[calc(100dvh-6rem)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-3xl border border-white/10 bg-[#0d111a]/70 shadow-2xl backdrop-blur-3xl echora-hide-scrollbar md:right-8"
      >
        <div className="flex flex-col p-5">
          {/* Cover art with the four hover corner actions */}
          <div className="group relative mb-4 flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-white/[0.04] shadow-lg">
            {song?.coverUrl ? (
              <CoverImage
                src={song.coverUrl}
                alt={song.title}
                wrapperClassName="h-full w-full"
                className="h-full w-full object-cover"
              />
            ) : (
              <Disc aria-hidden="true" size={40} className="text-white/20" />
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />

            <div className="pointer-events-none absolute left-3 top-3 -translate-x-3 -translate-y-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:translate-y-0 focus-within:opacity-100">
              <button type="button" onClick={onOpenSettings} className={CORNER_BUTTON} title={t('panel.openSettings')} aria-label={t('panel.openSettings')}>
                <Settings aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="pointer-events-none absolute right-3 top-3 translate-x-3 -translate-y-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:translate-y-0 focus-within:opacity-100">
              <button
                type="button"
                onClick={onToggleTransparentBackground}
                aria-pressed={transparentBackground}
                className={`${CORNER_BUTTON} ${transparentBackground ? 'border-white/30 bg-white/85 text-zinc-900 hover:bg-white' : ''}`}
                title={transparentBackground ? t('panel.transparentBackgroundOn') : t('panel.transparentBackgroundOff')}
                aria-label={t('panel.transparentBackground')}
              >
                <MirrorRectangular aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 -translate-x-3 translate-y-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:translate-y-0 focus-within:opacity-100">
              <button type="button" onClick={onBackHome} className={CORNER_BUTTON} title={t('panel.backHome')} aria-label={t('panel.backHome')}>
                <Home aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="pointer-events-none absolute bottom-3 right-3 translate-x-3 translate-y-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:translate-y-0 focus-within:opacity-100">
              <button
                type="button"
                onClick={onToggleLike}
                aria-pressed={isLiked}
                className={`${CORNER_BUTTON} ${isLiked ? 'border-red-400/40 bg-red-500/25 text-red-300' : ''}`}
                title={isLiked ? t('panel.removeFromFavorites') : t('panel.addToFavorites')}
                aria-label={isLiked ? t('panel.removeFromFavorites') : t('panel.addToFavorites')}
              >
                <Star aria-hidden="true" size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>

          {/* Icon-only tab switcher */}
          <div role="tablist" aria-label={t('panel.panelAria')} className="mb-4 flex rounded-xl bg-white/[0.06] p-1">
            {TABS.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => onTabChange(id)}
                title={t(labelKey)}
                aria-label={t(labelKey)}
                className={`flex flex-1 items-center justify-center rounded-lg py-2 transition-all ${
                  activeTab === id ? 'bg-white/10 text-white shadow-sm' : 'text-white opacity-40 hover:opacity-100'
                }`}
              >
                <Icon aria-hidden="true" size={16} />
              </button>
            ))}
          </div>

          <div className={`flex-1 pr-1 ${activeTab === 'cover' ? '' : 'min-h-[70px]'}`}>
            {activeTab === 'cover' && <SongInfoTab song={song} />}
            {activeTab === 'lyrics' && <LyricsTab {...lyrics} />}
            {activeTab === 'controls' && <ControlsTab {...controls} />}
            {activeTab === 'queue' && <QueueTab {...queue} />}
            {activeTab === 'account' && <AccountTab {...account} />}
          </div>
        </div>
      </div>

      {themeQuickEditorTheme && (
        <ThemeQuickEditor
          initialTheme={themeQuickEditorTheme}
          onClose={onCloseThemeQuickEditor}
          onSave={onSaveTheme}
        />
      )}
    </>
  );
}

