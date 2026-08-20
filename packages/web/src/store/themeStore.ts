import { create } from 'zustand';
import type { ThemeConfig } from '@echora/core';

export type MotionPreference = 'system' | 'on' | 'off';

const MOTION_PREFERENCE_KEY = 'echora.motion-preference';

const readMotionPreference = (): MotionPreference => {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(MOTION_PREFERENCE_KEY);
  return stored === 'on' || stored === 'off' ? stored : 'system';
};

interface ThemeState {
  activeTheme: 'light' | 'dark';
  currentTheme: ThemeConfig;
  customThemes: Record<string, ThemeConfig>;
  aiThemeEnabled: boolean;
  motionPreference: MotionPreference;

  setTheme: (theme: ThemeConfig) => void;
  toggleTheme: () => void;
  enableAiTheme: (enabled: boolean) => void;
  saveCustomTheme: (id: string, theme: ThemeConfig) => void;
  setMotionPreference: (preference: MotionPreference) => void;
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
  motionPreference: readMotionPreference(),

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

  setMotionPreference: (preference) => {
    if (typeof window !== 'undefined') {
      if (preference === 'system') window.localStorage.removeItem(MOTION_PREFERENCE_KEY);
      else window.localStorage.setItem(MOTION_PREFERENCE_KEY, preference);
    }
    set({ motionPreference: preference });
  },
}));
