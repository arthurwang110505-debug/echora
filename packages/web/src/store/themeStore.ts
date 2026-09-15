import { create } from 'zustand';
import type { ThemeConfig } from '@echora/core';

export type MotionPreference = 'system' | 'on' | 'off';

type StoredThemeState = {
  activeTheme?: 'light' | 'dark';
  currentTheme?: ThemeConfig;
};

const MOTION_PREFERENCE_KEY = 'echora.motion-preference';
const THEME_STATE_KEY = 'echora.theme-state';
const AI_THEME_ENABLED_KEY = 'echora.ai-theme-enabled';

export const DEFAULT_LIGHT_THEME: ThemeConfig = {
  name: 'Default Light',
  backgroundColor: '#f6f3ef',
  primaryColor: '#231f20',
  accentColor: '#c96e4f',
  secondaryColor: '#5c4d48',
  fontStyle: 'sans',
  provider: 'Echora',
};

export const DEFAULT_DARK_THEME: ThemeConfig = {
  name: 'Default Dark',
  backgroundColor: '#101217',
  primaryColor: '#f6f3ef',
  accentColor: '#d88d6e',
  secondaryColor: '#b9aea7',
  fontStyle: 'sans',
  provider: 'Echora',
};

const isThemeConfig = (value: unknown): value is ThemeConfig => {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Partial<ThemeConfig>;
  return [theme.name, theme.backgroundColor, theme.primaryColor, theme.accentColor, theme.secondaryColor]
    .every(field => typeof field === 'string' && field.trim().length > 0);
};

const readAiThemeEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(AI_THEME_ENABLED_KEY) === 'true';
};

const readMotionPreference = (): MotionPreference => {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(MOTION_PREFERENCE_KEY);
  return stored === 'on' || stored === 'off' ? stored : 'system';
};

const readStoredThemeState = (): Pick<ThemeState, 'activeTheme' | 'currentTheme'> => {
  if (typeof window === 'undefined') {
    return { activeTheme: 'dark', currentTheme: DEFAULT_DARK_THEME };
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(THEME_STATE_KEY) || 'null') as StoredThemeState | null;
    const activeTheme = stored?.activeTheme === 'light' ? 'light' : 'dark';
    return {
      activeTheme,
      currentTheme: isThemeConfig(stored?.currentTheme)
        ? stored.currentTheme
        : activeTheme === 'light' ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME,
    };
  } catch {
    return { activeTheme: 'dark', currentTheme: DEFAULT_DARK_THEME };
  }
};

const persistThemeState = (activeTheme: 'light' | 'dark', currentTheme: ThemeConfig) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STATE_KEY, JSON.stringify({ activeTheme, currentTheme }));
  } catch {
    // Local preference persistence is optional and must not block the UI.
  }
};

const initialThemeState = readStoredThemeState();

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
  ...initialThemeState,
  customThemes: {},
  aiThemeEnabled: readAiThemeEnabled(),
  motionPreference: readMotionPreference(),

  setTheme: (theme) => set((state) => {
    persistThemeState(state.activeTheme, theme);
    return { currentTheme: theme };
  }),

  toggleTheme: () => set((state) => {
    const activeTheme = state.activeTheme === 'light' ? 'dark' : 'light';
    const currentTheme = activeTheme === 'light' ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
    persistThemeState(activeTheme, currentTheme);
    return { activeTheme, currentTheme };
  }),

  enableAiTheme: (enabled) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AI_THEME_ENABLED_KEY, String(enabled));
      } catch {
        // Local preference persistence is optional and must not block the UI.
      }
    }
    set({ aiThemeEnabled: enabled });
  },

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
