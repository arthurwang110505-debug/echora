import { ReactNode } from 'react';
import { useThemeStore } from '../store/themeStore';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const useTheme = useThemeStore;
export { useThemeStore };
