import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song } from '@echora/core';
import { copyText } from './clipboard';

// src/components/player/panel/SongInfoTab.tsx
// 歌曲資訊 tab: title / artists / album, centred, each entry a click target.
//
// Upstream Folia navigates to an artist or album page from here. Echora has no artist or
// album pages (its library is playlist-shaped), so every entry copies instead — the
// affordance and the layout stay identical, only the destination differs. That difference
// is the one deliberate deviation in this port.

const artistName = (artist: Song['artists'][number]) => (typeof artist === 'string' ? artist : artist?.name || '');

type SongInfoTabProps = {
  song: Song | null;
};

export default function SongInfoTab({ song }: SongInfoTabProps) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const flash = (result: boolean) => {
    setFeedback(result ? 'copied' : 'failed');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFeedback(null), 1600);
  };

  if (!song) {
    return <p className="mt-4 text-center text-xs opacity-40">{t('panel.noTrack')}</p>;
  }

  const artists = song.artists.map(artistName).filter(Boolean);
  const albumName = song.album?.name || '';
  const titleLine = [song.title, artists.join(', '), albumName].filter(Boolean).join(' - ');

  const copy = async (payload: string) => {
    if (!payload) return;
    flash(await copyText(payload));
  };

  return (
    <div className="mt-4 flex flex-col items-center space-y-4 text-center">
      <div className="relative w-full space-y-1">
        <button
          type="button"
          onClick={() => void copy(titleLine)}
          title={t('panel.copySongInfo')}
          className="mx-auto block max-w-full cursor-pointer text-2xl font-bold leading-tight transition-opacity hover:opacity-80"
        >
          <span className="line-clamp-2">{song.title}</span>
        </button>

        <div className="space-y-1 text-sm opacity-60">
          <p className="font-medium">
            {artists.length === 0 ? '—' : artists.map((name, index) => (
              <Fragment key={`${name}-${index}`}>
                {index > 0 && ', '}
                <button
                  type="button"
                  onClick={() => void copy(name)}
                  className="cursor-pointer transition-opacity hover:opacity-100 hover:underline"
                >
                  {name}
                </button>
              </Fragment>
            ))}
          </p>
          {albumName && (
            <button
              type="button"
              onClick={() => void copy(albumName)}
              className="cursor-pointer opacity-60 transition-all hover:opacity-100 hover:underline"
            >
              {albumName}
            </button>
          )}
        </div>

        <p aria-live="polite" className="h-4 text-[10px] font-semibold text-[#62f5c4]">
          {feedback === 'copied' ? t('panel.copied') : feedback === 'failed' ? t('panel.copyFailed') : ''}
        </p>
      </div>
    </div>
  );
}
