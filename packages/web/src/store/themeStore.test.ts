import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from './themeStore';

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
