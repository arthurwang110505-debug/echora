import { LyricData, type StageNavidromeStructuredLyricLine } from '../../types';
import type { LyricParseFormat } from './parserCore';

export type UnifiedLyric = LyricData;

export interface LyricProcessingOptions {
    includeInterludes?: boolean;
    filterPattern?: string | null;
    songId?: number;
    fetchChorusRanges?: (songId: number) => Promise<Array<{ startTime: number; endTime: number }>>;
}

export interface RawEmbeddedLyric {
    type: 'embedded';
    // Raw USLT tags parsed from music-metadata.
    usltTags?: Array<{ language?: string, descriptor?: string, text: string }>;
    // Fallback simple strings (e.g. from IndexedDB cache).
    textContent?: string;
    translationContent?: string;
}

export interface RawLocalFileLyric {
    type: 'local';
    lrcContent: string;
    tLrcContent?: string;
    formatHint?: LyricParseFormat;
}

export interface RawQrcLyric {
    type: 'qrc';
    qrcContent: string;
    translationContent?: string;
}

export interface RawNeteaseLyric {
    type: 'netease';
    lrc?: {
        lyric?: string;
        pureMusic?: boolean;
        yrc?: { lyric?: string; pureMusic?: boolean };
        ytlrc?: { lyric?: string; pureMusic?: boolean };
        yromalrc?: { lyric?: string; pureMusic?: boolean };
        romalrc?: { lyric?: string; pureMusic?: boolean };
    };
    yrc?: { lyric?: string; pureMusic?: boolean };
    ytlrc?: { lyric?: string; pureMusic?: boolean };
    yromalrc?: { lyric?: string; pureMusic?: boolean };
    tlyric?: { lyric?: string; pureMusic?: boolean };
    romalrc?: { lyric?: string; pureMusic?: boolean };
    pureMusic?: boolean;
}

export interface RawNavidromeLyric {
    type: 'navidrome';
    // OpenSubsonic structured lyrics. Typed with Echora's own `StageNavidromeStructuredLyricLine`
    // rather than upstream's `StructuredLyric` / `StructuredLyricLine`, which live in a
    // `src/types/navidrome.ts` this repository has never ported - the import of it was a phantom, and
    // because the whole tree sat outside tsconfig.json's include it resolved to an error type that
    // nothing ever reported. `types.ts` already declares `StageNavidromeLyricSource`, the same
    // interface as this one, over the same line shape, so this now agrees with it. Porting
    // upstream's navidrome types would widen this field back to the full OpenSubsonic union; that is
    // Navidrome-source work, which is deliberately out of scope here.
    structuredLyrics?: StageNavidromeStructuredLyricLine[];
    // Standard Subsonic plain lyrics string
    plainLyrics?: string;
}

export type RawLyricSource = 
    | RawEmbeddedLyric 
    | RawLocalFileLyric 
    | RawQrcLyric
    | RawNeteaseLyric 
    | RawNavidromeLyric;
