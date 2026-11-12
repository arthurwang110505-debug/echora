// packages/web/src/api/origin.test.ts
//
// The API routes live in `api/`, outside every workspace package, so their specs live here: this
// is the one place with a working vitest and a node environment. The subject is the shared origin
// policy, which is where the review's highest-severity finding was.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowedHostnames, isAllowedRequest, requestHostname } from '@api/_lib/origin';

const LOCAL = ['localhost', '127.0.0.1'];
const ENV_KEYS = ['ECHORA_ALLOWED_ORIGINS', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'ECHORA_ALLOW_LOCALHOST'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('allowedHostnames', () => {
  // The test environment adds localhost so `vite dev` keeps working; these specs only care about
  // the configured entries, so they filter it out rather than asserting on the whole list.
  const configured = () => allowedHostnames().filter(host => !LOCAL.includes(host));

  it('reads explicit origins as hostnames', () => {
    process.env.ECHORA_ALLOWED_ORIGINS = 'https://echora.app, staging.echora.app';
    expect(configured()).toEqual(['echora.app', 'staging.echora.app']);
  });

  it('includes the deployment hostnames Vercel exposes', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'echora.vercel.app';
    process.env.VERCEL_URL = 'echora-git-main-user.vercel.app';
    expect(configured()).toEqual(['echora.vercel.app', 'echora-git-main-user.vercel.app']);
  });

  it('has nothing to allow when not configured', () => {
    expect(configured()).toEqual([]);
  });

  it('allows localhost only outside production', () => {
    // Without this, `vite dev` cannot call its own API and the endpoints are untestable locally.
    expect(allowedHostnames()).toEqual(expect.arrayContaining(LOCAL));
  });
});

describe('isAllowedRequest', () => {
  it('refuses the arbitrary *.vercel.app host the old policy let through', () => {
    // The whole point of the fix: someone else's deployment is not this deployment.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'echora.vercel.app';
    expect(isAllowedRequest('https://attacker.vercel.app')).toBe(false);
  });

  it('allows this deployment from any hostname it answers to', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'echora.vercel.app';
    expect(isAllowedRequest('https://echora.vercel.app')).toBe(true);
  });

  it('allows the same origin even when nothing is configured', () => {
    // A preview URL nobody listed still has to be able to call its own API.
    expect(isAllowedRequest('https://whatever-abc123.vercel.app', {
      sameOrigin: 'whatever-abc123.vercel.app',
    })).toBe(true);
  });

  it('refuses a missing Origin by default, because that is a script', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'echora.vercel.app';
    expect(isAllowedRequest(undefined)).toBe(false);
  });

  it('allows a missing Origin when the endpoint serves public data', () => {
    expect(isAllowedRequest(undefined, { allowMissingOrigin: true })).toBe(true);
  });

  it('refuses a malformed Origin', () => {
    expect(isAllowedRequest('not a url')).toBe(false);
  });

  it('matches explicit hosts as well as deployed ones', () => {
    process.env.ECHORA_ALLOWED_ORIGINS = 'https://echora.app';
    expect(isAllowedRequest('https://echora.app')).toBe(true);
    expect(isAllowedRequest('https://echora.app.example.com')).toBe(false);
  });
});

describe('requestHostname', () => {
  it('prefers the forwarded host, then host', () => {
    expect(requestHostname({ 'x-forwarded-host': 'echora.app' })).toBe('echora.app');
    expect(requestHostname({ host: 'localhost:3000' })).toBe('localhost');
  });

  it('takes the first entry of a chain', () => {
    expect(requestHostname({ 'x-forwarded-host': 'echora.app, proxy.internal' })).toBe('echora.app');
  });

  it('answers null when there is neither', () => {
    expect(requestHostname({})).toBeNull();
  });
});
