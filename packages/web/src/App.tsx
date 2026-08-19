import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { PlayerProvider } from './contexts/PlayerContext';
import { ThemeProvider } from './contexts/ThemeProvider';
import Home from './pages/Home';
import Player from './pages/Player';
import Settings from './pages/Settings';
import Library from './pages/Library';
import YouTubeCallback from './pages/YouTubeCallback';
import './App.css';

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
        <RouterProvider router={router} />
      </PlayerProvider>
    </ThemeProvider>
  );
}

export default App;
