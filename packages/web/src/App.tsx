import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import PersistentMiniPlayer from './components/PersistentMiniPlayer';
import { RouteSkeleton } from './components/LoadingSkeletons';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Player = lazy(() => import('./pages/Player'));
const Settings = lazy(() => import('./pages/Settings'));
const Library = lazy(() => import('./pages/Library'));
const YouTubeCallback = lazy(() => import('./pages/YouTubeCallback'));

function RouteLoader() {
  return <RouteSkeleton />;
}

function AppShell() {
  const location = useLocation();
  const showPersistentMiniPlayer = location.pathname !== '/settings' && location.pathname !== '/library';

  return <><Outlet />{showPersistentMiniPlayer ? <PersistentMiniPlayer /> : null}</>;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
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
