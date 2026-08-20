import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeProvider';
import Home from './pages/Home';
import './App.css';

const Player = lazy(() => import('./pages/Player'));
const Settings = lazy(() => import('./pages/Settings'));
const Library = lazy(() => import('./pages/Library'));
const YouTubeCallback = lazy(() => import('./pages/YouTubeCallback'));

function RouteLoader() {
  return <div className="flex min-h-screen items-center justify-center bg-[#07090e] text-sm font-bold text-[#b8ffe2]" role="status">正在載入 Echora 舞台…</div>;
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/player', element: <Player /> },
  { path: '/settings', element: <Settings /> },
  { path: '/library', element: <Library /> },
  { path: '/oauth/youtube/callback', element: <YouTubeCallback /> },
]);

function App() {
  return (
    <ThemeProvider>
      <PlayerProvider>
        <Suspense fallback={<RouteLoader />}><RouterProvider router={router} /></Suspense>
      </PlayerProvider>
    </ThemeProvider>
  );
}

export default App;
