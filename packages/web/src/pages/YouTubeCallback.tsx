import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';

export default function YouTubeCallback() {
  const navigate = useNavigate();
  const youtubeError = usePlayer(state => state.youtubeError);

  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/?youtube=connected', { replace: true }), 700);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07090e] px-6 text-center text-white">
      <div>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#ff3d57]/30 bg-[#ff3d57]/10 text-3xl">♫</div>
        <h1 className="text-xl font-bold">正在連接 YouTube Music…</h1>
        <p className="mt-2 text-sm text-slate-400">授權完成後會自動返回 Echora。</p>
        {youtubeError && <p className="mt-4 text-xs text-rose-300">{youtubeError}</p>}
      </div>
    </div>
  );
}
