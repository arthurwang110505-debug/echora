import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useRouteError } from 'react-router-dom';
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import PersistentMiniPlayer from './components/PersistentMiniPlayer';
import { RouteSkeleton } from './components/LoadingSkeletons';
import './App.css';
import { isChunkLoadError, lazyWithRetry, recoverFromStaleBuild } from './utils/recovery';
import { withLocaleBundle } from './i18n';

// Every route pulls its own copy with it: the entry chunk carries only the strings the app shell
// itself renders (`i18n/locales/shell.*.json`). The assignment lives in `i18n/bundles.ts` and is
// policed by `i18n/localeBundles.test.ts`.
const Welcome = lazyWithRetry(withLocaleBundle('home', () => import('./pages/Welcome')), 'route-welcome');
const AppHome = lazyWithRetry(withLocaleBundle('home', () => import('./pages/AppHome')), 'route-app-home');
const Player = lazyWithRetry(withLocaleBundle('player', () => import('./pages/Player')), 'route-player');
const Settings = lazyWithRetry(withLocaleBundle('settings', () => import('./pages/Settings')), 'route-settings');
const Library = lazyWithRetry(withLocaleBundle('library', () => import('./pages/Library')), 'route-library');
const Privacy = lazyWithRetry(withLocaleBundle('legal', () => import('./pages/Privacy')), 'route-privacy');
const Terms = lazyWithRetry(withLocaleBundle('legal', () => import('./pages/Terms')), 'route-terms');
// These two render from the shell copy on purpose: the OBS overlay and the OAuth callback are the
// lightest pages in the app, and neither should drag the player's panel strings in behind it.
const YouTubeCallback = lazyWithRetry(() => import('./pages/YouTubeCallback'), 'route-youtube-callback');
// The overlay an OBS browser source points at. Chrome-free by design, and outside the app shell
// chrome the other routes render inside.
const ObsStage = lazyWithRetry(() => import('./pages/ObsStage'), 'route-obs-stage');

function RouteLoader() {
  return <RouteSkeleton />;
}

// Landing routes serve new visitors; the PWA (and every in-app "back" action)
// enters through /app so installed users never wait behind the landing page.
const LANDING_PATHS = new Set(['/', '/welcome']);

function AppShell() {
  const location = useLocation();
  const hidePersistentMiniPlayer =
    location.pathname === '/settings' ||
    location.pathname === '/library' ||
    location.pathname === '/privacy' ||
    location.pathname === '/terms' ||
    LANDING_PATHS.has(location.pathname);

  return <><Outlet />{hidePersistentMiniPlayer ? null : <PersistentMiniPlayer />}</>;
}

function RouteErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  const isChunkError = isChunkLoadError(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090e] p-6 text-slate-100">
      <section role="alert" className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111720] p-7 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#62f5c4]">Echora recovery</p>
        <h1 className="mt-3 text-2xl font-black text-white">{t('appHome.pageLoadError')}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {isChunkError
            ? t('appHome.pageLoadErrorCopyStale')
            : t('appHome.pageLoadErrorCopyGeneric')}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => { void recoverFromStaleBuild(); }}
            className="min-h-11 rounded-xl bg-[#62f5c4] px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110"
          >
            {t('appHome.clearCacheReload')}
          </button>
          <button
            type="button"
            onClick={() => { window.location.assign('/app'); }}
            className="min-h-11 rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            {t('appHome.backToPlayerHome')}
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
      { path: '/', element: <Welcome /> },
      { path: '/welcome', element: <Welcome /> },
      { path: '/app', element: <AppHome /> },
      { path: '/player', element: <Player /> },
      { path: '/settings', element: <Settings /> },
      { path: '/library', element: <Library /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
      { path: '/obs', element: <ObsStage /> },
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
