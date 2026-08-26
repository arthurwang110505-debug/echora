import React from 'react';

const LAZY_RETRY_PREFIX = 'echora:lazy-retry:';

export const isChunkLoadError = (error: unknown): boolean => {
    const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : '';

    return /dynamically imported module|importing a module script failed|failed to fetch|loading chunk|chunkloaderror/i.test(message);
};

const getRetryStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
};

export const lazyWithRetry = <T extends React.ComponentType<any>>(
    importer: () => Promise<{ default: T }>,
    key: string,
): React.LazyExoticComponent<T> => React.lazy(async () => {
    try {
        const module = await importer();
        getRetryStorage()?.removeItem(`${LAZY_RETRY_PREFIX}${key}`);
        return module;
    } catch (error) {
        if (!isChunkLoadError(error)) throw error;

        const storage = getRetryStorage();
        const retryKey = `${LAZY_RETRY_PREFIX}${key}`;
        if (!storage || storage.getItem(retryKey)) throw error;

        storage.setItem(retryKey, '1');
        window.location.reload();
        throw error;
    }
});

export const recoverFromStaleBuild = async (): Promise<void> => {
    try {
        const storage = getRetryStorage();
        if (storage) {
            for (let index = storage.length - 1; index >= 0; index -= 1) {
                const key = storage.key(index);
                if (key?.startsWith(LAZY_RETRY_PREFIX)) storage.removeItem(key);
            }
        }
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
        }
        if (typeof caches !== 'undefined') {
            const cacheKeys = await caches.keys();
            await Promise.all(
                cacheKeys
                    .filter(key => key.startsWith('workbox-'))
                    .map(key => caches.delete(key)),
            );
        }
    } finally {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('recovered', String(Date.now()));
            window.location.replace(url.toString());
        }
    }
};
