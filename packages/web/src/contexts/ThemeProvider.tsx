import { useEffect, type ReactNode } from 'react';
import { useThemeStore } from '../store/themeStore';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const motionPreference = useThemeStore((state) => state.motionPreference);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotionPolicy = () => {
      const reduced = motionPreference === 'on' || (motionPreference === 'system' && mediaQuery.matches);
      document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
      document.documentElement.dataset.motionPreference = motionPreference;
    };

    applyMotionPolicy();
    mediaQuery.addEventListener?.('change', applyMotionPolicy);
    return () => mediaQuery.removeEventListener?.('change', applyMotionPolicy);
  }, [motionPreference]);

  return <>{children}</>;
}

export const useTheme = useThemeStore;
export { useThemeStore };
