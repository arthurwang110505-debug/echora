import { useEffect, useState } from 'react';
import { Music2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { buildYouTubeCallbackPath, getYouTubeLoginReturnPath } from '../integrations/youtubeAuth';

export default function YouTubeCallback() {
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
        <h1 className="text-xl font-bold">{connectionFailed ? 'YouTube Music 連線未完成' : '正在驗證 YouTube Music 授權…'}</h1>
        <p className="mt-2 text-sm text-slate-400">{connectionFailed ? '無法驗證授權或讀取帳號資料，將返回原本頁面顯示修正方式。' : '授權完成後會驗證帳號與歌單存取權。'}</p>
        {youtubeError && <p className="mt-4 text-xs text-rose-300">{youtubeError}</p>}
      </div>
    </div>
  );
}
