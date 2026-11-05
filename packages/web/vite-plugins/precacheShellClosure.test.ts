import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { precacheShellClosure } from './precacheShellClosure';

/**
 * These exercise the graph walk, not workbox: a fake dist with the same file shapes Rollup
 * emits, fed straight into the transform. The real build is checked end to end by
 * `scripts/check-shell-closure.mjs` (which reads the generated `sw.js`), so the point here is the
 * parsing rules - which is where an offline regression would come from.
 */
const makeDist = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'precache-closure-'));
    mkdirSync(join(dir, 'assets'));
    for (const [name, source] of Object.entries(files)) {
        writeFileSync(join(dir, 'assets', name), source);
    }
    return dir;
};

const entry = (url: string) => ({ url, revision: 'globbed' });

describe('precache shell closure', () => {
    it('adds the chunks the entry statically imports, and nothing else', async () => {
        const distDir = makeDist({
            'index-aaa.js': 'import{r}from"./react-vendor-bbb.js";import"./vite-helper-ccc.js";',
            'react-vendor-bbb.js': 'export const r=1;',
            'vite-helper-ccc.js': 'export const h=2;',
            'VisualizerSonnet-ddd.js': 'export const s=3;',
        });

        const transform = precacheShellClosure({ distDir, entryPatterns: [/^assets\/index-.*\.js$/] });
        const result = await transform([entry('assets/index-aaa.js')]);

        expect(result.manifest.map(item => item.url).sort()).toEqual([
            'assets/index-aaa.js',
            'assets/react-vendor-bbb.js',
            'assets/vite-helper-ccc.js',
        ]);
        // A file outside the shell must stay out: this is the difference between a 1 MB install
        // and one that carries every visualizer stage.
        expect(result.manifest.some(item => item.url.includes('VisualizerSonnet'))).toBe(false);
    });

    it('does not follow dynamic imports', async () => {
        const distDir = makeDist({
            'index-aaa.js': 'import("./VisualizerSonnet-ddd.js").then(m=>m);',
            'VisualizerSonnet-ddd.js': 'export const s=3;',
        });

        const transform = precacheShellClosure({ distDir, entryPatterns: [/^assets\/index-.*\.js$/] });
        const result = await transform([entry('assets/index-aaa.js')]);

        expect(result.manifest).toHaveLength(1);
    });

    it('keeps the revision a glob already assigned instead of adding the file twice', async () => {
        // `Welcome` is precached by a glob and also imported by nothing; an entry imported by a
        // route keeps its glob revision, because two revisions of one URL make workbox keep both.
        const distDir = makeDist({
            'Welcome-aaa.js': 'import{x}from"./BrandMark-bbb.js";',
            'BrandMark-bbb.js': 'export const x=1;',
        });

        const transform = precacheShellClosure({ distDir, entryPatterns: [/^assets\/Welcome-.*\.js$/] });
        const result = await transform([entry('assets/Welcome-aaa.js')]);

        expect(result.manifest).toHaveLength(2);
        expect(result.manifest[0]).toEqual({ url: 'assets/Welcome-aaa.js', revision: 'globbed' });
        const added = result.manifest.find(item => item.url.includes('BrandMark'));
        // A 32-character content hash, so a changed chunk is a changed revision.
        expect(added?.revision).toMatch(/^[0-9a-f]{32}$/);
    });

    it('follows re-exports and chained dependencies', async () => {
        const distDir = makeDist({
            'index-aaa.js': 'export{a}from"./one-bbb.js";',
            'one-bbb.js': 'export{b}from"./two-ccc.js";',
            'two-ccc.js': 'import{d}from"./three-ddd.js";export const b=1;',
            'three-ddd.js': 'export const d=1;',
        });

        const transform = precacheShellClosure({ distDir, entryPatterns: [/^assets\/index-.*\.js$/] });
        const result = await transform([entry('assets/index-aaa.js')]);

        expect(result.manifest.map(item => item.url).sort()).toEqual([
            'assets/index-aaa.js',
            'assets/one-bbb.js',
            'assets/three-ddd.js',
            'assets/two-ccc.js',
        ]);
        expect(result.warnings?.[0]).toContain('added 3 shell dependencies');
    });

    it('fails the build when the entry globs no longer match the output', async () => {
        const distDir = makeDist({ 'somewhere-else-aaa.js': '' });
        const transform = precacheShellClosure({ distDir, entryPatterns: [/^assets\/index-.*\.js$/] });

        // Silently precaching nothing is how the white screen shipped once: the glob and the chunk
        // name drifted apart and nothing said so.
        await expect(transform([entry('assets/other-aaa.js')])).rejects.toThrow(/drifted apart/);
    });

    it('fails the build when a statically imported chunk is missing from the output', async () => {
        const distDir = makeDist({ 'index-aaa.js': 'import"./ghost-bbb.js";' });
        const transform = precacheShellClosure({ distDir, entryPatterns: [/^assets\/index-.*\.js$/] });

        await expect(transform([entry('assets/index-aaa.js')])).rejects.toThrow(/not in the build output/);
    });
});
