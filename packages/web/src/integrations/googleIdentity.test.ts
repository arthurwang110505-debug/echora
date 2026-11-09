// src/integrations/googleIdentity.test.ts
//
// Three behaviours the popup flow depends on and a reviewer cannot see by reading one call site:
// the script is fetched once for the whole app, a failed fetch is never cached, and a load that
// hangs is abandoned rather than leaving the button dead forever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetGoogleIdentityLoaderForTests,
  getGoogleIdentityApi,
  loadGoogleIdentity,
  resolveConsentPrompt,
  type GoogleIdentityApi,
} from './googleIdentity';

/** A fake `<script>`: records its listeners so a test can fire load or error. */
const createScript = (src = '') => {
  const listeners = new Map<string, () => void>();
  return {
    src,
    async: false,
    defer: false,
    addEventListener: (type: string, handler: () => void) => { listeners.set(type, handler); },
    fire: (type: string) => listeners.get(type)?.(),
  };
};

/** A fake document that hands out scripts and remembers what was appended. */
const createDoc = () => {
  const scripts: ReturnType<typeof createScript>[] = [];
  const doc = {
    head: {
      appendChild: (script: ReturnType<typeof createScript>) => { scripts.push(script); return script; },
    },
    createElement: () => createScript(),
    querySelectorAll: () => [] as unknown as NodeListOf<HTMLScriptElement>,
  };
  return { doc, scripts };
};

const fakeApi = (): GoogleIdentityApi => ({
  initTokenClient: () => ({ requestAccessToken: () => {} }),
  revoke: () => {},
});

const stubGoogle = (api: GoogleIdentityApi | null) => {
  vi.stubGlobal('google', api ? { accounts: { oauth2: api } } : undefined);
};

beforeEach(() => {
  __resetGoogleIdentityLoaderForTests();
  stubGoogle(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  __resetGoogleIdentityLoaderForTests();
});

describe('getGoogleIdentityApi', () => {
  it('returns null before the script has run', () => {
    expect(getGoogleIdentityApi()).toBeNull();
  });

  it('reads the API off a given scope rather than assuming window', () => {
    const api = fakeApi();
    expect(getGoogleIdentityApi({ google: { accounts: { oauth2: api } } } as unknown as typeof globalThis)).toBe(api);
  });
});

describe('loadGoogleIdentity', () => {
  it('short-circuits when the script has already exposed the API', async () => {
    const api = fakeApi();
    stubGoogle(api);
    const { doc, scripts } = createDoc();

    await expect(loadGoogleIdentity({ doc: doc as unknown as Document })).resolves.toBe(api);
    // Nothing to load, so nothing may be appended.
    expect(scripts).toHaveLength(0);
  });

  it('appends the GIS script once and resolves when it loads', async () => {
    const { doc, scripts } = createDoc();
    const pending = loadGoogleIdentity({ doc: doc as unknown as Document });

    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://accounts.google.com/gsi/client');

    const api = fakeApi();
    stubGoogle(api);
    scripts[0].fire('load');
    await expect(pending).resolves.toBe(api);
  });

  it('shares one promise between concurrent callers', async () => {
    const { doc, scripts } = createDoc();
    const docAsDocument = doc as unknown as Document;

    const first = loadGoogleIdentity({ doc: docAsDocument });
    const second = loadGoogleIdentity({ doc: docAsDocument });
    expect(second).toBe(first);

    const api = fakeApi();
    stubGoogle(api);
    scripts[0].fire('load');
    await Promise.all([first, second]);
    expect(scripts).toHaveLength(1);
  });

  it('does not cache a failure, so the next click retries', async () => {
    const { doc, scripts } = createDoc();
    const docAsDocument = doc as unknown as Document;

    const first = loadGoogleIdentity({ doc: docAsDocument });
    scripts[0].fire('error');
    await expect(first).rejects.toThrow('Google Identity Services 載入失敗');

    // A second attempt must append a second script, not reuse the rejected promise.
    const second = loadGoogleIdentity({ doc: docAsDocument });
    expect(second).not.toBe(first);
    expect(scripts).toHaveLength(2);

    const api = fakeApi();
    stubGoogle(api);
    scripts[1].fire('load');
    await expect(second).resolves.toBe(api);
  });

  it('attaches to an existing script tag instead of appending a duplicate', async () => {
    const existing = createScript('https://accounts.google.com/gsi/client');
    const doc = {
      head: { appendChild: vi.fn() },
      createElement: () => createScript(),
      querySelectorAll: () => [existing] as unknown as NodeListOf<HTMLScriptElement>,
    };

    const pending = loadGoogleIdentity({ doc: doc as unknown as Document });
    expect(doc.head.appendChild).not.toHaveBeenCalled();

    const api = fakeApi();
    stubGoogle(api);
    existing.fire('load');
    await expect(pending).resolves.toBe(api);
  });

  it('rejects when the script loads but exposes no oauth2 API', async () => {
    const { doc, scripts } = createDoc();
    const pending = loadGoogleIdentity({ doc: doc as unknown as Document });
    scripts[0].fire('load'); // google is still stubbed to null
    await expect(pending).rejects.toThrow('未提供 oauth2 API');
  });

  it('gives up after the timeout rather than hanging forever', async () => {
    vi.useFakeTimers();
    const { doc } = createDoc();

    const pending = loadGoogleIdentity({ doc: doc as unknown as Document, timeoutMs: 100 });
    const assertion = expect(pending).rejects.toThrow('載入逾時');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('allows a retry after a timeout', async () => {
    vi.useFakeTimers();
    const { doc, scripts } = createDoc();
    const docAsDocument = doc as unknown as Document;

    const first = loadGoogleIdentity({ doc: docAsDocument, timeoutMs: 100 });
    const assertion = expect(first).rejects.toThrow('載入逾時');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    const second = loadGoogleIdentity({ doc: docAsDocument });
    expect(second).not.toBe(first);
    expect(scripts).toHaveLength(2);
  });

  it('defaults to a twelve second budget', async () => {
    // Asserted by behaviour rather than by importing the constant, which is not part of the API.
    // The number matters: too short and a cold 3G fetch of the script fails, too long and the
    // connect button appears dead.
    vi.useFakeTimers();
    const { doc } = createDoc();

    const pending = loadGoogleIdentity({ doc: doc as unknown as Document });
    let settled = false;
    void pending.catch(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(11_999);
    expect(settled).toBe(false);

    const assertion = expect(pending).rejects.toThrow('載入逾時');
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
});

describe('resolveConsentPrompt', () => {
  it.each([
    [{}, 'select_account'],
    [{ selectAccount: true }, 'select_account'],
    [{ selectAccount: false }, ''],
    [{ silent: true }, ''],
    [{ silent: true, selectAccount: true }, ''],
  ])('%j → %j', (options, expected) => {
    expect(resolveConsentPrompt(options)).toBe(expected);
  });
});
