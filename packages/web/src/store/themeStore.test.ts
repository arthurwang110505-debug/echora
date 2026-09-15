import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, useThemeStore } from './themeStore';

describe('theme settings', () => {
  beforeEach(() => {
    useThemeStore.setState({
      activeTheme: 'dark',
      currentTheme: DEFAULT_DARK_THEME,
      aiThemeEnabled: false,
      motionPreference: 'system',
    });
  });

  it('toggles the visible theme as well as the active theme state', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().activeTheme).toBe('light');
    expect(useThemeStore.getState().currentTheme).toEqual(DEFAULT_LIGHT_THEME);

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().activeTheme).toBe('dark');
    expect(useThemeStore.getState().currentTheme).toEqual(DEFAULT_DARK_THEME);
  });

  it('supports enabling and disabling AI theme generation', () => {
    useThemeStore.getState().enableAiTheme(true);
    expect(useThemeStore.getState().aiThemeEnabled).toBe(true);
    useThemeStore.getState().enableAiTheme(false);
    expect(useThemeStore.getState().aiThemeEnabled).toBe(false);
  });
});

describe('theme motion preference', () => {
  beforeEach(() => {
    useThemeStore.setState({ motionPreference: 'system' });
  });

  it('defaults to system preference', () => {
    expect(useThemeStore.getState().motionPreference).toBe('system');
  });

  it('supports explicit on and off overrides', () => {
    useThemeStore.getState().setMotionPreference('on');
    expect(useThemeStore.getState().motionPreference).toBe('on');

    useThemeStore.getState().setMotionPreference('off');
    expect(useThemeStore.getState().motionPreference).toBe('off');
  });

  it('can return to the system preference', () => {
    useThemeStore.getState().setMotionPreference('on');
    useThemeStore.getState().setMotionPreference('system');
    expect(useThemeStore.getState().motionPreference).toBe('system');
  });
});
