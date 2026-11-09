// @vitest-environment jsdom
//
// The behaviour that matters is the re-acquire: the browser drops the lock whenever the page is
// hidden, so a hook that only requests once is a hook that silently stops working the first time
// the user checks a message.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenWakeLock } from './useScreenWakeLock';

const sentinel = () => ({
  released: false,
  release: vi.fn(function (this: { released: boolean }) { this.released = true; return Promise.resolve(); }),
  addEventListener: vi.fn(),
});

let host: HTMLDivElement;
let root: Root;

const mount = async (enabled: boolean, requestWakeLock: () => Promise<ReturnType<typeof sentinel>>) => {
  const Probe = () => {
    useScreenWakeLock({ enabled, requestWakeLock });
    return null;
  };
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<Probe />);
  });
};

const setVisibility = async (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
});

describe('useScreenWakeLock', () => {
  it('takes the lock while enabled', async () => {
    const requestWakeLock = vi.fn(async () => sentinel());
    await mount(true, requestWakeLock);
    expect(requestWakeLock).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', async () => {
    const requestWakeLock = vi.fn(async () => sentinel());
    await mount(false, requestWakeLock);
    expect(requestWakeLock).not.toHaveBeenCalled();
  });

  it('re-acquires after the tab is hidden and shown again', async () => {
    const requestWakeLock = vi.fn(async () => sentinel());
    await mount(true, requestWakeLock);
    expect(requestWakeLock).toHaveBeenCalledTimes(1);

    await setVisibility('hidden');
    await setVisibility('visible');
    expect(requestWakeLock).toHaveBeenCalledTimes(2);
  });

  it('does not stack locks when visibility flickers', async () => {
    const requestWakeLock = vi.fn(async () => sentinel());
    await mount(true, requestWakeLock);
    await setVisibility('visible');
    // Still holding the first one, so no second request.
    expect(requestWakeLock).toHaveBeenCalledTimes(1);
  });

  it('releases the lock when it unmounts', async () => {
    const lock = sentinel();
    await mount(true, async () => lock);
    act(() => root.unmount());
    expect(lock.release).toHaveBeenCalled();
  });

  it('stays silent when the browser refuses', async () => {
    // A refusal is normal (low battery, unsupported context) and must not throw into React.
    const requestWakeLock = vi.fn(async () => { throw new Error('NotAllowedError'); });
    await expect(mount(true, requestWakeLock)).resolves.toBeUndefined();
    expect(requestWakeLock).toHaveBeenCalled();
  });
});
