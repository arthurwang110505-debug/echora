import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Music2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { buildYouTubeCallbackPath, getYouTubeLoginReturnPath } from '../integrations/youtubeAuth';

export default function YouTubeCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const youtubeError = usePlayer(state => state.youtubeError);
  const restoreYouTubeSession = usePlayer(state => state.restoreYouTubeSession);
  const [connectionFailed, setConnectionFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const returnTo = getYouTubeLoginReturnPath();

    void restoreYouTubeSession().then(() => {
      if (cancelled) return;
      const connected = usePlayer.getState().youtubeConnected;
      setConnectionFailed(!connected);
      navigate(buildYouTubeCallbackPath(returnTo, connected ? 'connected' : 'error'), { replace: true });
    });

    return () => { cancelled = true; };
  }, [navigate, restoreYouTubeSession]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07090e] px-6 text-center text-white">
      <div>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#ff3d57]/30 bg-[#ff3d57]/10 text-[#ff3d57]">
          <Music2 aria-hidden="true" size={28} />
        </div>
        <h1 className="text-xl font-bold">{connectionFailed ? t('player.ytConnectFailed') : t('player.ytVerifying')}</h1>
        <p className="mt-2 text-sm text-slate-400">{connectionFailed ? t('player.ytConnectFailedCopy') : t('player.ytVerifyingCopy')}</p>
        {youtubeError && <p className="mt-4 text-xs text-rose-300">{youtubeError}</p>}
      </div>
    </div>
  );
}
