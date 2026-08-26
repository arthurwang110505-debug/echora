import { Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useRouteError } from 'react-router-dom';
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import PersistentMiniPlayer from './components/PersistentMiniPlayer';
import { RouteSkeleton } from './components/LoadingSkeletons';
import './App.css';
import { isChunkLoadError, lazyWithRetry, recoverFromStaleBuild } from './utils/recovery';

const Home = lazyWithRetry(() => import('./pages/Home'), 'route-home');
const Player = lazyWithRetry(() => import('./pages/Player'), 'route-player');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'route-settings');
const Library = lazyWithRetry(() => import('./pages/Library'), 'route-library');
const YouTubeCallback = lazyWithRetry(() => import('./pages/YouTubeCallback'), 'route-youtube-callback');

function RouteLoader() {
  return <RouteSkeleton />;
}

function AppShell() {
  const location = useLocation();
  const showPersistentMiniPlayer = location.pathname !== '/settings' && location.pathname !== '/library';

  return <><Outlet />{showPersistentMiniPlayer ? <PersistentMiniPlayer /> : null}</>;
}

function RouteErrorBoundary() {
  const error = useRouteError();
  const isChunkError = isChunkLoadError(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090e] p-6 text-slate-100">
      <section role="alert" className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111720] p-7 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#62f5c4]">Echora recovery</p>
        <h1 className="mt-3 text-2xl font-black text-white">頁面暫時無法載入</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {isChunkError
            ? '這通常是更新中的舊快取或暫時載入失敗所致。重新載入會保留目前網址與播放選擇。'
            : '這個頁面遇到暫時性錯誤。你可以重新載入目前頁面，或先回到首頁。'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => { void recoverFromStaleBuild(); }}
            className="min-h-11 rounded-xl bg-[#62f5c4] px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110"
          >
            清除快取並重新載入
          </button>
          <button
            type="button"
            onClick={() => { window.location.assign('/'); }}
            className="min-h-11 rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            回到首頁
          </button>
        </div>
      </section>
    </main>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/player', element: <Player /> },
      { path: '/settings', element: <Settings /> },
      { path: '/library', element: <Library /> },
      { path: '/oauth/youtube/callback', element: <YouTubeCallback /> },
    ],
  },
]);

function App() {
  return (
    <ThemeProvider>
      <PlayerProvider>
        <AppErrorBoundary>
          <Suspense fallback={<RouteLoader />}><RouterProvider router={router} /></Suspense>
        </AppErrorBoundary>
      </PlayerProvider>
    </ThemeProvider>
  );
}

export default App;
