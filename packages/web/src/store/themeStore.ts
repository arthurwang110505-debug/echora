import { create } from 'zustand';
import type { ThemeConfig } from '@echora/core';

interface ThemeState {
  activeTheme: 'light' | 'dark';
  currentTheme: ThemeConfig;
  customThemes: Record<string, ThemeConfig>;
  aiThemeEnabled: boolean;

  setTheme: (theme: ThemeConfig) => void;
  toggleTheme: () => void;
  enableAiTheme: (enabled: boolean) => void;
  saveCustomTheme: (id: string, theme: ThemeConfig) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  activeTheme: 'dark',
  currentTheme: {
    name: 'Default Dark',
    backgroundColor: '#101217',
    primaryColor: '#f6f3ef',
    accentColor: '#d88d6e',
    secondaryColor: '#b9aea7',
    fontStyle: 'sans',
  },
  customThemes: {},
  aiThemeEnabled: false,

  setTheme: (theme) => set({ currentTheme: theme }),

  toggleTheme: () => {
    set((state) => ({
      activeTheme: state.activeTheme === 'light' ? 'dark' : 'light',
    }));
  },

  enableAiTheme: (enabled) => set({ aiThemeEnabled: enabled }),

  saveCustomTheme: (id, theme) => set((state) => ({
    customThemes: { ...state.customThemes, [id]: theme },
  })),
}));
