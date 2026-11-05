import { describe, expect, it } from 'vitest';
import {
    BUNDLED_COVER_VARIANT_SIZE,
    LOCAL_COVER_THUMBNAIL_SIZES,
    getSizedCoverUrl,
    resolveLocalCoverThumbnailSize,
} from './coverUrl';

/**
 * The bundled demo covers are 1920x1920 webp files under `public/covers/`, precached for offline
 * use. `getSizedCoverUrl` used to leave them untouched (it only knew how to add a size *query*,
 * and a static file ignores one), so every 44 px queue thumbnail downloaded and decoded the full
 * 1.5 MB animated image. These lock in the file-variant path and, just as importantly, that it
 * does not touch URLs it cannot resize.
 */
describe('cover url sizing', () => {
    it('maps a bundled demo cover to its smaller sibling', () => {
        expect(getSizedCoverUrl('/covers/ocean-morning.webp', 512))
            .toBe('/covers/ocean-morning-1024.webp');
        expect(getSizedCoverUrl('/covers/ocean-morning.webp', BUNDLED_COVER_VARIANT_SIZE))
            .toBe('/covers/ocean-morning-1024.webp');
        // Names with digits and dashes already in them must survive the rewrite.
        expect(getSizedCoverUrl('/covers/dancing-in-the-stardust.webp', 96))
            .toBe('/covers/dancing-in-the-stardust-1024.webp');
        expect(getSizedCoverUrl('/covers/sun-beneath-a-song.webp', 1024))
            .toBe('/covers/sun-beneath-a-song-1024.webp');
    });

    it('keeps the full-resolution file for the stage, which draws it full-screen', () => {
        expect(getSizedCoverUrl('/covers/ocean-morning.webp', 2048))
            .toBe('/covers/ocean-morning.webp');
        expect(getSizedCoverUrl('/covers/ocean-morning.webp', BUNDLED_COVER_VARIANT_SIZE + 1))
            .toBe('/covers/ocean-morning.webp');
    });

    it('does not rewrite a cover that is already the smaller variant', () => {
        expect(getSizedCoverUrl('/covers/ocean-morning-1024.webp', 512))
            .toBe('/covers/ocean-morning-1024.webp');
    });

    it('leaves every other URL alone', () => {
        // Remote covers are already handled by the CDN branches below this one.
        expect(getSizedCoverUrl('https://example.com/art.png', 512)).toBe('https://example.com/art.png');
        expect(getSizedCoverUrl('blob:https://echora.local/1234', 512)).toBe('blob:https://echora.local/1234');
        expect(getSizedCoverUrl('data:image/png;base64,AAAA', 512)).toBe('data:image/png;base64,AAAA');
        // A bundled cover that is not a webp has no variant to point at.
        expect(getSizedCoverUrl('/covers/poster.png', 512)).toBe('/covers/poster.png');
        expect(getSizedCoverUrl('/elsewhere/song.webp', 512)).toBe('/elsewhere/song.webp');
    });

    it('keeps the size query for the sources that do resize server-side', () => {
        expect(getSizedCoverUrl('https://p1.music.126.net/abc.jpg', 512))
            .toBe('https://p1.music.126.net/abc.jpg?param=512y512');
        expect(getSizedCoverUrl('https://example.com/api/getCoverArt?id=7', 300))
            .toContain('size=300');
    });

    it('rounds a local thumbnail size up to a shipped bucket', () => {
        expect(resolveLocalCoverThumbnailSize(100)).toBe(LOCAL_COVER_THUMBNAIL_SIZES[0]);
        expect(resolveLocalCoverThumbnailSize(512)).toBe(512);
        expect(resolveLocalCoverThumbnailSize(9999)).toBe(1024);
    });

    it('answers an empty string for a missing cover', () => {
        expect(getSizedCoverUrl(undefined, 512)).toBe('');
        expect(getSizedCoverUrl('   ', 512)).toBe('');
    });
});
