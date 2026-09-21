// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEditableTarget, isMacPlatform, resolvePlayerShortcut, type ShortcutEventLike } from './usePlayerShortcuts';

const key = (partial: Partial<ShortcutEventLike>): ShortcutEventLike => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  ...partial,
});

describe('resolvePlayerShortcut — the guide\'s 播放頁面 shortcut table', () => {
  it('plays/pauses on Space, matched by code so non-Latin layouts work', () => {
    expect(resolvePlayerShortcut(key({ code: 'Space', key: ' ' }), false)).toBe('playPause');
    expect(resolvePlayerShortcut(key({ code: 'Space', key: 'ы' }), false)).toBe('playPause');
  });

  it('uses Ctrl for track changes on Windows/Linux', () => {
    expect(resolvePlayerShortcut(key({ key: 'ArrowLeft', ctrlKey: true }), false)).toBe('prev');
    expect(resolvePlayerShortcut(key({ key: 'ArrowRight', ctrlKey: true }), false)).toBe('next');
  });

  it('uses Cmd for track changes on macOS, as the guide notes', () => {
    expect(resolvePlayerShortcut(key({ key: 'ArrowLeft', metaKey: true }), true)).toBe('prev');
    expect(resolvePlayerShortcut(key({ key: 'ArrowRight', metaKey: true }), true)).toBe('next');
    // Ctrl+← on macOS is not the track shortcut, so it falls through to the 5s seek.
    expect(resolvePlayerShortcut(key({ key: 'ArrowLeft', ctrlKey: true }), true)).toBe('seekBackward');
  });

  it('seeks 5 seconds with the bare arrows', () => {
    expect(resolvePlayerShortcut(key({ key: 'ArrowLeft' }), false)).toBe('seekBackward');
    expect(resolvePlayerShortcut(key({ key: 'ArrowRight' }), false)).toBe('seekForward');
  });

  it('toggles the panel with P, the chrome with H, and fullscreen with F11', () => {
    expect(resolvePlayerShortcut(key({ key: 'p' }), false)).toBe('togglePanel');
    expect(resolvePlayerShortcut(key({ key: 'P' }), false)).toBe('togglePanel');
    expect(resolvePlayerShortcut(key({ key: 'h' }), false)).toBe('toggleChrome');
    expect(resolvePlayerShortcut(key({ key: 'F11' }), false)).toBe('toggleFullscreen');
  });

  it('opens the command palette with either Ctrl+K or Cmd+K', () => {
    expect(resolvePlayerShortcut(key({ key: 'k', ctrlKey: true }), false)).toBe('openCommandPalette');
    expect(resolvePlayerShortcut(key({ key: 'K', metaKey: true }), true)).toBe('openCommandPalette');
  });

  it('keeps Echora\'s keyboard-only volume: arrows and M', () => {
    expect(resolvePlayerShortcut(key({ key: 'ArrowUp' }), false)).toBe('volumeUp');
    expect(resolvePlayerShortcut(key({ key: 'ArrowDown' }), false)).toBe('volumeDown');
    expect(resolvePlayerShortcut(key({ key: 'm' }), false)).toBe('toggleMute');
  });

  it('ignores key repeats and unbound keys', () => {
    expect(resolvePlayerShortcut(key({ key: 'p', repeat: true }), false)).toBeNull();
    expect(resolvePlayerShortcut(key({ key: 'z' }), false)).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('is true for inputs, textareas, selects and contenteditable nodes', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    // jsdom ships no `contentEditable` IDL setter, so set the attribute the way a browser
    // reflects it; the guard accepts either form.
    editable.setAttribute('contenteditable', 'true');
    for (const node of [input, textarea, select, editable]) {
      expect(isEditableTarget(node)).toBe(true);
    }
  });

  it('is false for buttons and null targets', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('isMacPlatform', () => {
  it('reports a boolean without throwing when navigator data is thin', () => {
    expect(typeof isMacPlatform()).toBe('boolean');
  });
});
