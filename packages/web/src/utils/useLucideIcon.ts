import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { loadLucideIcon } from './lucideIconResolver';

/**
 * Resolves a theme icon name to a renderable component, loading just that one icon.
 *
 * Exists so a component that draws a theme's icon in React (rather than tracing its geometry) does
 * not have to `import * as LucideIcons` for the lookup. That static import is a request for all
 * ~2,000 icons and Rollup answers it with one 878 kB chunk that every mode importing it downloads
 * in full, to render the one or two icons a theme actually names.
 *
 * Answers null on the first render and after the load fails. Callers already had a fallback path
 * for an unknown name (a petal, a star), so a null here reaches the same branch.
 */
const loadedIcons = new Map<string, LucideIcon | null>();
const pendingIcons = new Map<string, Promise<LucideIcon | null>>();

const loadOnce = (name: string) => {
    const pending = pendingIcons.get(name);
    if (pending) return pending;
    const job = loadLucideIcon(name).then(icon => {
        loadedIcons.set(name, icon);
        pendingIcons.delete(name);
        return icon;
    });
    pendingIcons.set(name, job);
    return job;
};

export const useLucideIcon = (name: string | null | undefined): LucideIcon | null => {
    const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
    const [icon, setIcon] = useState<LucideIcon | null>(() => (
        key ? loadedIcons.get(key) ?? null : null
    ));

    useEffect(() => {
        if (!key) {
            setIcon(null);
            return undefined;
        }
        if (loadedIcons.has(key)) {
            setIcon(loadedIcons.get(key) ?? null);
            return undefined;
        }
        // A theme switch can unmount this component mid-load; the cached result is still wanted,
        // so only the state write is skipped.
        let mounted = true;
        void loadOnce(key).then(result => {
            if (mounted) setIcon(result);
        });
        return () => {
            mounted = false;
        };
    }, [key]);

    return icon;
};
