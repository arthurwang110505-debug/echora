import { useEffect, useRef } from 'react';

// src/hooks/usePlayerShortcuts.ts
// The 播放頁面 keyboard contract from the guide:
//
//   Space            播放 / 暫停
//   Ctrl + ←         上一首        (Cmd + ← on macOS)
//   Ctrl + →         下一首        (Cmd + → on macOS)
//   ←                倒退 5 秒
//   →                快進 5 秒
//   P                切換右側面板
//   H                隱藏進度條和右下角按鈕
//   F11              全螢幕
//   Ctrl/Cmd + K     打開命令面板
//
// Echora keeps two more from its own stage rules: ↑ / ↓ trim volume and M mutes, which is how
// the immersive stage gets volume without any on-screen widget.

export type PlayerShortcutAction =
  | 'playPause'
  | 'next'
  | 'prev'
  | 'seekBackward'
  | 'seekForward'
  | 'togglePanel'
  | 'toggleChrome'
  | 'toggleFullscreen'
  | 'openCommandPalette'
  | 'volumeUp'
  | 'volumeDown'
  | 'toggleMute';

export type PlayerShortcutHandlers = Partial<Record<PlayerShortcutAction, () => void>>;

export type ShortcutEventLike = {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
};

export const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
};

/** Pure mapping from a key event to an action, so the table above is unit-testable. */
export function resolvePlayerShortcut(event: ShortcutEventLike, isMac: boolean): PlayerShortcutAction | null {
  if (event.repeat) return null;

  // Space is matched by code: on non-Latin layouts `key` is the produced character.
  if (event.code === 'Space' || event.key === ' ') return 'playPause';

  const trackMod = isMac ? event.metaKey : event.ctrlKey;
  if (trackMod && event.key === 'ArrowLeft') return 'prev';
  if (trackMod && event.key === 'ArrowRight') return 'next';

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') return 'openCommandPalette';

  switch (event.key) {
    case 'ArrowLeft': return 'seekBackward';
    case 'ArrowRight': return 'seekForward';
    case 'ArrowUp': return 'volumeUp';
    case 'ArrowDown': return 'volumeDown';
    case 'F11': return 'toggleFullscreen';
    default: break;
  }

  const lower = event.key.toLowerCase();
  if (lower === 'p') return 'togglePanel';
  if (lower === 'h') return 'toggleChrome';
  if (lower === 'm') return 'toggleMute';
  return null;
}

/** Single-character shortcuts must never fire while the user is typing somewhere. */
export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Some DOM shims leave `isContentEditable` unimplemented, so fall back to the attribute;
  // either way this must stay a strict boolean.
  return target.isContentEditable === true || target.getAttribute('contenteditable') === 'true';
};

export function usePlayerShortcuts(handlers: PlayerShortcutHandlers, enabled = true) {
  // Handlers change every render (they close over player state); keep the listener stable and
  // read the latest ones through a ref instead of re-subscribing on each render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;
    const isMac = isMacPlatform();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const action = resolvePlayerShortcut(event, isMac);
      if (!action) return;
      const handler = handlersRef.current[action];
      if (!handler) return;
      // Every action here owns the key: the browser must not scroll, beep, or fullscreen on us.
      event.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
