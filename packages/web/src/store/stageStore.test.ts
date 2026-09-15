import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('stage preferences', () => {
  beforeEach(() => {
    vi.resetModules();
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
      },
    });
  });

  it('remembers the chosen visualizer and per-song lyrics offset', async () => {
    const { useStageStore, songOffsetKey } = await import('./stageStore');
    useStageStore.getState().setActiveVisualizer('cadenza');
    useStageStore.getState().setBackgroundMode('fluid');
    useStageStore.getState().setAutoVisualizer(true);
    useStageStore.getState().setLyricsOffset(songOffsetKey({ source: 'local', id: 'demo-blue-knot' }), -0.5);

    expect(useStageStore.getState().activeVisualizer).toBe('cadenza');
    expect(useStageStore.getState().backgroundMode).toBe('fluid');
    expect(useStageStore.getState().autoVisualizer).toBe(true);
    expect(useStageStore.getState().getLyricsOffset('local:demo-blue-knot')).toBe(-0.5);
    expect(window.localStorage.getItem('echora.stage-prefs')).toContain('cadenza');
    expect(window.localStorage.getItem('echora.lyrics-offsets')).toContain('demo-blue-knot');
  });
});
