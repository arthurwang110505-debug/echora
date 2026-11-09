import { describe, expect, it } from 'vitest';
import {
    isLucideIconName,
    loadLucideIcon,
    lucideIconNode,
    preloadLucideIcons,
    resolveLucideIconNames,
} from './lucideIconResolver';

/**
 * These cover the contract the modes rely on, not lucide's data.
 *
 * The module used to `import * as LucideIcons`, which is a request for every icon module and cost
 * an 878 kB shared chunk. Everything below is about the two properties that made replacing it
 * safe: name resolution stays synchronous and case-insensitive, and geometry is only answered for
 * names that were explicitly preloaded (so a scene never silently waits on a module).
 */
describe('lucide icon resolver', () => {
    it('resolves names case-insensitively to their canonical spelling', () => {
        expect(resolveLucideIconNames(['star'])).toEqual(['Star']);
        expect(resolveLucideIconNames(['STAR'])).toEqual(['Star']);
        expect(resolveLucideIconNames(['Star'])).toEqual(['Star']);
    });

    it('drops unknown names instead of substituting a default', () => {
        // Callers add their own fallback (a petal, a star); inventing one here would hide a typo in
        // a theme.
        expect(resolveLucideIconNames(['NotARealIcon'])).toEqual([]);
        expect(resolveLucideIconNames(['Music', 'NotARealIcon', 'Heart'])).toEqual(['Music', 'Heart']);
    });

    it('deduplicates regardless of spelling', () => {
        expect(resolveLucideIconNames(['Star', 'star', 'STAR'])).toEqual(['Star']);
    });

    it('accepts the kebab-case spelling themes sometimes carry', () => {
        expect(resolveLucideIconNames(['a-arrow-down'])).toEqual(['AArrowDown']);
        expect(isLucideIconName('a-arrow-down')).toBe(true);
        expect(isLucideIconName('AArrowDown')).toBe(true);
    });

    it('answers "is this a name" without loading anything', () => {
        expect(isLucideIconName('Star')).toBe(true);
        expect(isLucideIconName('')).toBe(false);
        expect(isLucideIconName(undefined)).toBe(false);
        expect(isLucideIconName('DefinitelyNotAnIcon')).toBe(false);
    });

    it('answers null geometry for a name that was never preloaded', () => {
        // Synchronous by contract: the line-art builder cannot await per glyph, so a missing
        // preload has to degrade to "draw no icon" rather than start a load nobody waits for.
        expect(lucideIconNode('Star')).toBeNull();
    });

    it('loads a component for a valid name and null for an invalid one', async () => {
        const icon = await loadLucideIcon('Star');
        expect(icon).toBeTruthy();
        expect(await loadLucideIcon('DefinitelyNotAnIcon')).toBeNull();
    });

    it('makes geometry available after a preload, keyed the way callers ask for it', async () => {
        await preloadLucideIcons(['Star']);
        // The caller's spelling is PascalCase; the cache has to answer for that form.
        const node = lucideIconNode('Star');
        expect(Array.isArray(node)).toBe(true);
        expect(node!.length).toBeGreaterThan(0);
        // Same geometry through the other spelling, so a theme written either way works.
        expect(lucideIconNode('star')).toEqual(node);
    });

    it('ignores unknown names during preload instead of throwing', async () => {
        await expect(preloadLucideIcons(['DefinitelyNotAnIcon'])).resolves.toBeUndefined();
        expect(lucideIconNode('DefinitelyNotAnIcon')).toBeNull();
    });
});
