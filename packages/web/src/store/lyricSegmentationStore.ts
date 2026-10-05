import { create } from 'zustand';
import {
    LYRIC_SEGMENTATION_RECORD_VERSION,
    isLyricSegmentationRecord,
    type LyricSegmentationRecord,
    type LyricSegmentationSource,
} from '../lyrics/segmentationRecord';

// src/store/lyricSegmentationStore.ts
// The saved word segmentation, per song, plus the record for the song playing right now.
//
// Upstream persists this in its cache DB keyed by a `lyricSeg_` prefix — chosen so that clearing the
// lyric cache cannot silently destroy work that cost the user money or manual effort. Echora has no
// cache DB, so it follows its own per-song precedent (`echora.lyrics-offsets` in stageStore) and
// stores one JSON map in localStorage.
//
// Because it is a map in a 5 MB store rather than a cache table, it is capped: the newest
// MAX_SONGS records are kept, oldest evicted first. A record is a few KB, and a user who segments
// hundreds of songs should lose the ones they touched longest ago rather than lose the ability to
// store anything else.

const STORAGE_KEY = 'echora.lyric-segmentation';
const MAX_SONGS = 40;

const readStoredRecords = (): Record<string, LyricSegmentationRecord> => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return {};
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
                .filter((entry): entry is [string, LyricSegmentationRecord] => isLyricSegmentationRecord(entry[1])),
        );
    } catch {
        return {};
    }
};

const writeStoredRecords = (records: Record<string, LyricSegmentationRecord>) => {
    if (typeof window === 'undefined') return;
    try {
        const capped = Object.entries(records)
            .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
            .slice(0, MAX_SONGS);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(capped)));
    } catch {
        // Persistence is optional; a full disk must never block playback.
    }
};

type LyricSegmentationState = {
    /** Every saved record, by song key. */
    records: Record<string, LyricSegmentationRecord>;
    /** Song the loaded record belongs to, or null when nothing is loaded. Kept beside the record so
     *  a load that resolves after the user skipped can be discarded instead of applied to the wrong song. */
    songKey: string | null;
    record: LyricSegmentationRecord | null;
    loadForSong: (songKey: string | null) => void;
    save: (record: LyricSegmentationRecord) => void;
    reset: (songKey: string | null) => void;
};

export const useLyricSegmentationStore = create<LyricSegmentationState>((set, get) => ({
    records: readStoredRecords(),
    songKey: null,
    record: null,
    loadForSong: (songKey) => {
        if (!songKey) {
            set({ songKey: null, record: null });
            return;
        }
        const record = get().records[songKey] ?? null;
        set({ songKey, record });
    },
    save: (record) => {
        const records = { ...get().records, [record.songKey]: record };
        writeStoredRecords(records);
        set({ records, songKey: record.songKey, record });
    },
    reset: (songKey) => {
        if (!songKey) return;
        const records = { ...get().records };
        delete records[songKey];
        writeStoredRecords(records);
        set({ records, songKey, record: null });
    },
}));

/** Read-only handle for code that must not subscribe (the stage render path). */
export const getLyricSegmentationRecordFor = (songKey: string | null): LyricSegmentationRecord | null => (
    songKey ? useLyricSegmentationStore.getState().records[songKey] ?? null : null
);

export const createSegmentationRecordFor = (
    songKey: string,
    source: LyricSegmentationSource,
    lines: Record<string, string[]>,
): LyricSegmentationRecord => ({
    version: LYRIC_SEGMENTATION_RECORD_VERSION,
    songKey,
    updatedAt: Date.now(),
    source,
    lines,
});
