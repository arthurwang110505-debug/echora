// src/utils/coverUrl.ts

const NON_RESIZABLE_COVER_PROTOCOLS = new Set(['blob:', 'data:', 'file:', 'filesystem:']);
export const LOCAL_COVER_THUMBNAIL_SIZES = [512, 1024] as const;

export const resolveLocalCoverThumbnailSize = (size: number): number => {
    const normalizedSize = Math.max(1, Math.round(size));
    return LOCAL_COVER_THUMBNAIL_SIZES.find(candidate => candidate >= normalizedSize)
        ?? LOCAL_COVER_THUMBNAIL_SIZES[LOCAL_COVER_THUMBNAIL_SIZES.length - 1];
};

const withLocalCoverThumbnailSize = (url: URL, size: number): string => {
    url.searchParams.set('size', String(resolveLocalCoverThumbnailSize(size)));
    return url.toString();
};

/**
 * Bundled demo covers, and the smaller variants that ship beside them.
 *
 * `public/covers/*.webp` are 1920x1920 and 3.3 MB in total (one of them, `sun-beneath-a-song`,
 * is an animated four-frame file). A 44 px queue thumbnail, a 36 px mini-player and eleven
 * visualizers that sample the art at texture resolution do not need that: each ships a
 * single-frame `-1024.webp` sibling instead (96-154 kB, 634 kB for all five, which is what the
 * service worker precaches), and this picks it.
 *
 * The stage backdrop is the one caller that asks for the full image, so it passes a size above
 * `BUNDLED_COVER_VARIANT_SIZE`.
 */
const BUNDLED_COVER_DIRECTORY = '/covers/';
export const BUNDLED_COVER_VARIANT_SIZE = 1024;

const isBundledCover = (pathname: string): boolean => (
    pathname.startsWith(BUNDLED_COVER_DIRECTORY) && pathname.endsWith('.webp')
    && !/-\d+\.webp$/i.test(pathname)
);

/**
 * Resolves a cover image URL to a smaller variant when the source supports one.
 *
 * Sources that can resize server-side (163's `126.net`, `getCoverArt`, `folia-cover:`) answer with
 * a URL parameter. Bundled demo covers cannot, so they are answered with a different file; any
 * size at or above `BUNDLED_COVER_VARIANT_SIZE` deliberately keeps the original, because that is
 * the stage drawing it full-screen.
 */
export const getSizedCoverUrl = (url: string | null | undefined, size: number): string => {
    const trimmedUrl = url?.trim() ?? '';
    if (!trimmedUrl) return '';

    const normalizedSize = Math.max(1, Math.round(size));

    if (normalizedSize <= BUNDLED_COVER_VARIANT_SIZE) {
        const [pathname] = trimmedUrl.split(/[?#]/);
        if (isBundledCover(pathname)) {
            return `${pathname.slice(0, -'.webp'.length)}-${BUNDLED_COVER_VARIANT_SIZE}.webp`;
        }
    }

    try {
        const urlObj = new URL(trimmedUrl);
        if (NON_RESIZABLE_COVER_PROTOCOLS.has(urlObj.protocol)) {
            return trimmedUrl;
        }

        if (urlObj.protocol === 'folia-cover:') {
            return withLocalCoverThumbnailSize(urlObj, normalizedSize);
        }

        if (urlObj.hostname.includes('126.net')) {
            return `${urlObj.origin}${urlObj.pathname}?param=${normalizedSize}y${normalizedSize}`;
        }

        if (urlObj.pathname.includes('getCoverArt')) {
            urlObj.searchParams.set('size', String(normalizedSize));
            return urlObj.toString();
        }

        return trimmedUrl;
    } catch {
        if (trimmedUrl.startsWith('/__folia_cover/')) {
            const localUrl = new URL(trimmedUrl, 'https://folia.local');
            localUrl.searchParams.set('size', String(resolveLocalCoverThumbnailSize(normalizedSize)));
            return `${localUrl.pathname}${localUrl.search}`;
        }

        if (trimmedUrl.includes('126.net')) {
            return `${trimmedUrl.split('?')[0]}?param=${normalizedSize}y${normalizedSize}`;
        }

        return trimmedUrl;
    }
};
