import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const readSource = (relativePath: string) => readFileSync(resolve(SRC_ROOT, relativePath), 'utf8');

// Strings that would mean a volume widget (or a volume handler) leaked into a surface.
const VOLUME_MARKERS = ['VolumeControl', 'setVolume', 'toggleMute', 'nudgeVolume', 'VolumeX', 'Volume2', 'Volume1', 'volume'];

/**
 * Product rule, not a style preference: the immersive stage must stay free of
 * transport furniture. Volume lives in the normal player chrome and in Settings; inside
 * the stage it is keyboard-only (ArrowUp/ArrowDown/M) with nothing on screen.
 * These assertions fail CI if someone adds a control to a stage surface.
 */
describe('stage volume guard', () => {
  it('keeps every volume affordance out of the immersive stage chrome', () => {
    const immersiveChrome = readSource('components/player/ImmersiveChrome.tsx');
    for (const marker of VOLUME_MARKERS) {
      expect(immersiveChrome, `ImmersiveChrome must not reference ${marker}`).not.toContain(marker);
    }
  });

  it('keeps volume out of the stage-only visual surfaces', () => {
    for (const file of [
      'components/OriginalFoliaVisualizerStage.tsx',
      'components/LyriclessSoundscapeStage.tsx',
      'components/FoliaLyricStage.tsx',
    ]) {
      const source = readSource(file);
      for (const marker of VOLUME_MARKERS.filter(item => item !== 'volume')) {
        expect(source, `${file} must not reference ${marker}`).not.toContain(marker);
      }
    }
  });

  it('renders the transport bar - and therefore the volume control - only outside the stage', () => {
    const player = readSource('pages/Player.tsx');
    const gate = player.indexOf("displayMode !== 'stage'");
    const transport = player.indexOf('<TransportBar');
    expect(gate).toBeGreaterThan(-1);
    expect(transport).toBeGreaterThan(gate);
    // No other <TransportBar render may exist outside that gate.
    expect(player.indexOf('<TransportBar', transport + 1)).toBe(-1);
    expect(player, 'Player page must not own volume UI itself').not.toContain('VolumeControl');
  });

  it('keeps the <ImmersiveChrome> element free of volume props', () => {
    const player = readSource('pages/Player.tsx');
    const start = player.indexOf('<ImmersiveChrome');
    const end = player.indexOf('/>', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(player.slice(start, end)).not.toMatch(/volume/i);
  });

  it('still exposes volume where it is allowed', () => {
    expect(readSource('components/player/TransportBar.tsx')).toContain('VolumeControl');
    expect(readSource('pages/Settings.tsx')).toContain('VolumeControl');
  });

  it('mounts the side panel in both modes but strips its volume row inside the stage', () => {
    const player = readSource('pages/Player.tsx');
    // One shared panel for both modes, gated only by the H-key hide switch.
    const panelGate = player.indexOf('{!isChromeHidden && (');
    const panel = player.indexOf('<UnifiedPanel');
    expect(panelGate).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(panelGate);
    expect(player.indexOf('<UnifiedPanel', panel + 1)).toBe(-1);
    // The stage instance must opt out of the volume row, so the rule above still holds.
    expect(player).toContain('showVolume: displayMode !== \'stage\'');
  });

  it('gates the 播放控制 volume row behind showVolume, so the stage can drop it', () => {
    const controls = readSource('components/player/panel/ControlsTab.tsx');
    expect(controls).toContain('showVolume?: boolean');
    expect(controls).toMatch(/\{showVolume && <VolumeControl/);
  });

  it('keeps the 退出全螢幕 bar free of transport furniture', () => {
    const exitBar = readSource('components/player/StageExitBar.tsx');
    for (const marker of VOLUME_MARKERS) {
      expect(exitBar, `StageExitBar must not reference ${marker}`).not.toContain(marker);
    }
  });
});
