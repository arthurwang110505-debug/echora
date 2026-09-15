import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './recovery';

describe('lazy chunk recovery', () => {
    it('recognizes browser dynamic-import and chunk loading failures', () => {
        expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/Player-abc.js'))).toBe(true);
        expect(isChunkLoadError('Loading chunk 42 failed.')).toBe(true);
        expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    });

    it('does not classify ordinary render errors as stale chunk errors', () => {
        expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
        expect(isChunkLoadError({ message: 'network timeout' })).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
    });
});
