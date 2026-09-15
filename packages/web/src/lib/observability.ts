import { recordDiagnostic } from './diagnostics';

const SENSITIVE_KEY = /token|lyric|playlist|password|authorization|cookie|email/i;

const scrub = (details: Record<string, string | number | boolean>) => (
  Object.fromEntries(
    Object.entries(details).filter(([key]) => !SENSITIVE_KEY.test(key)),
  ) as Record<string, string | number | boolean>
);

const reportToSentry = (message: string, details: Record<string, string | number | boolean>) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || typeof fetch !== 'function') return;
  try {
    const url = new URL(dsn);
    // Public DSN shape: https://<key>@<host>/<project>
    const key = url.username;
    const project = url.pathname.replace(/^\//, '');
    if (!key || !project) return;
    void fetch(`${url.protocol}//${url.host}/api/${project}/store/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}` },
      body: JSON.stringify({
        message,
        extra: scrub(details),
        tags: { app: 'echora' },
      }),
    }).catch(() => undefined);
  } catch {
    // Observability must never break playback.
  }
};

export const reportClientError = (message: string, details: Record<string, string | number | boolean> = {}) => {
  const safe = scrub(details);
  recordDiagnostic('render_error', { message, ...safe });
  reportToSentry(message, safe);
};

export const initObservability = () => {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  try {
    const lcp = new PerformanceObserver(list => {
      const entry = list.getEntries().at(-1);
      if (!entry) return;
      recordDiagnostic('web_vital', { name: 'LCP', value: Math.round(entry.startTime) });
    });
    lcp.observe({ type: 'largest-contentful-paint', buffered: true } as PerformanceObserverInit);
  } catch {
    // Safari may reject LCP observation.
  }

  try {
    const inp = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number }>) {
        recordDiagnostic('web_vital', { name: 'INP', value: Math.round(entry.duration || 0) });
      }
    });
    inp.observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
  } catch {
    // Event timing is not available in every browser.
  }

  window.addEventListener('error', event => {
    reportClientError(event.message || 'window.error');
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason instanceof Error ? event.reason.message : 'unhandledrejection';
    reportClientError(String(reason));
  });
};
