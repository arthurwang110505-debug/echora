import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_THRESHOLD, durationSimilarity, normalizeForMatch, pickBestCandidate, scoreCandidate, similarity, type LyricCandidate } from './matchScore';

/**
 * The failure this module exists for, in one sentence: LRCLIB's search returns a list, the old code
 * took the first entry that had synced lyrics, and for any song with a common title the first entry
 * is frequently a cover, a live take, or a different song with a similar name. Wrong lyrics that
 * look right are worse than no lyrics, because the user has no way to tell.
 */

const candidate = (overrides: Partial<LyricCandidate>): LyricCandidate => ({
  name: 'Song',
  artistName: 'Artist',
  duration: 200,
  syncedLyrics: '[00:00.00] lyric',
  ...overrides,
});

describe('normalizeForMatch', () => {
  it('folds case, punctuation and spacing away', () => {
    expect(normalizeForMatch("Don't Stop Me Now")).toBe(normalizeForMatch('dont stop me now'));
    expect(normalizeForMatch('夜に駆ける')).toBe(normalizeForMatch('夜に駆ける'));
  });

  it('folds full-width ASCII to its ASCII equivalent', () => {
    // Japanese uploads frequently use full-width Latin letters in titles.
    expect(normalizeForMatch('ＭＶ')).toBe(normalizeForMatch('MV'));
  });

  it('drops packaging via the title cleaner', () => {
    expect(normalizeForMatch('夜に駆ける (Official Video)')).toBe(normalizeForMatch('夜に駆ける'));
  });

  it('returns an empty string for empty input rather than throwing', () => {
    expect(normalizeForMatch('')).toBe('');
    expect(normalizeForMatch('()')).toBe('');
  });
});

describe('similarity', () => {
  it('scores identical titles at 1', () => {
    expect(similarity('夜に駆ける', '夜に駆ける')).toBe(1);
    expect(similarity('夜に駆ける', '夜に駆ける (Official Video)')).toBe(1);
  });

  it('scores an unrelated title low', () => {
    expect(similarity('夜に駆ける', '紅蓮華')).toBeLessThan(0.3);
  });

  it('recognises containment when the shorter string is substantial', () => {
    expect(similarity('夜に駆ける', '夜に駆ける English Ver')).toBeGreaterThanOrEqual(0.9);
  });

  it('does not award full marks for a short word inside a long title', () => {
    // "Love" is a substring of "Love Story", but they are not the same song.
    expect(similarity('Love', "Love Story (Taylor's Version)")).toBeLessThan(0.9);
  });

  it('scores a reversed pair as the same song', () => {
    // Channel prefix in front of the title, which is what a `Channel - Title` upload produces.
    expect(similarity('YOASOBI 夜に駆ける', '夜に駆ける')).toBeGreaterThan(0.5);
  });

  it('does not treat one shared word as a strong match', () => {
    // "Love" appears in both, but sharing most of the short side's characters is not identity: the
    // result has to fall below the bar at which a candidate is shown as *this* song.
    expect(similarity('Love Story', 'Love')).toBeLessThan(DEFAULT_MATCH_THRESHOLD);
  });

  it('returns 0 when either side is empty', () => {
    expect(similarity('', '夜に駆ける')).toBe(0);
    expect(similarity('夜に駆ける', '')).toBe(0);
  });
});

describe('durationSimilarity', () => {
  it('treats a couple of seconds as a perfect match', () => {
    // LRCLIB durations are rounded, and a YouTube upload may trim a silent intro.
    expect(durationSimilarity(200, 201)).toBe(1);
  });

  it('decays with the gap and reaches 0 at the tolerance', () => {
    expect(durationSimilarity(200, 215)).toBeGreaterThan(0);
    expect(durationSimilarity(200, 215)).toBeLessThan(1);
    expect(durationSimilarity(200, 230)).toBe(0);
    expect(durationSimilarity(200, 400)).toBe(0);
  });

  it('is neutral when either duration is unknown', () => {
    expect(durationSimilarity(undefined, 200)).toBeNull();
    expect(durationSimilarity(200, undefined)).toBeNull();
    expect(durationSimilarity(0, 200)).toBeNull();
  });
});

describe('scoreCandidate', () => {
  const query = { title: '夜に駆ける', artist: 'YOASOBI', duration: 261 };

  it('scores the actual recording highest', () => {
    const exact = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261 }), query);
    const cover = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'Some Cover Channel', duration: 254 }), query);
    const wrongSong = scoreCandidate(candidate({ name: '紅蓮華', artistName: 'LiSA', duration: 240 }), query);

    expect(exact.score).toBeGreaterThan(cover.score);
    expect(cover.score).toBeGreaterThan(wrongSong.score);
  });

  it('separates two versions of the same song by duration', () => {
    // A live take and the studio cut share a title and an artist; only the duration tells them apart.
    const studio = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261 }), query);
    const live = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 320 }), query);

    expect(studio.score).toBeGreaterThan(live.score);
  });

  it('redistributes weight instead of punishing a missing signal', () => {
    // A record with no duration is not *wrong* about the duration. Scoring that as zero would let a
    // complete-but-wrong record beat a correct-but-sparse one.
    const sparse = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: undefined }), query);
    expect(sparse.score).toBe(1);
    expect(sparse.parts.duration).toBeNull();
  });

  it('does not cap the score when the query has no artist', () => {
    const scored = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261 }), { title: '夜に駆ける', duration: 261 });
    expect(scored.score).toBe(1);
  });

  it('reports which signals contributed', () => {
    const scored = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261 }), query);
    expect(scored.parts).toMatchObject({ title: 1, artist: 1, duration: 1 });
    expect(scored.hasLyrics).toBe(true);
  });

  it('marks a record with no lyrics as such', () => {
    const scored = scoreCandidate(candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: undefined, plainLyrics: undefined }), query);
    expect(scored.hasLyrics).toBe(false);
  });
});

describe('pickBestCandidate', () => {
  const query = { title: '夜に駆ける', artist: 'YOASOBI', duration: 261 };

  it('chooses by agreement, not by position in the list', () => {
    // The regression this exists for: the correct record is last, and a cover is first.
    const candidates = [
      candidate({ name: '夜に駆ける', artistName: 'Piano Cover Channel', duration: 240 }),
      candidate({ name: '夜に駆ける (Live)', artistName: 'YOASOBI', duration: 330 }),
      candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261 }),
    ];

    expect(pickBestCandidate(candidates, query)?.candidate.artistName).toBe('YOASOBI');
    expect(pickBestCandidate(candidates, query)?.candidate.duration).toBe(261);
  });

  it('returns null rather than the least-bad option when nothing is close', () => {
    // Honest "no match" produces an "unavailable" badge. Returning the first hit produced the wrong
    // song's lyrics with no indication anything was wrong.
    const candidates = [
      candidate({ name: '紅蓮華', artistName: 'LiSA', duration: 240 }),
      candidate({ name: '残酷な天使のテーゼ', artistName: '高橋洋子', duration: 245 }),
    ];

    expect(pickBestCandidate(candidates, query)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(pickBestCandidate([], query)).toBeNull();
  });

  it('ignores records with no lyrics, however well they match', () => {
    const noLyrics = candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: undefined, plainLyrics: undefined });
    expect(pickBestCandidate([noLyrics], query)).toBeNull();
  });

  it('accepts an instrumental record as a match', () => {
    // An instrumental is a real answer, not a miss: the UI shows "instrumental" rather than
    // pretending no lyrics exist.
    const instrumental = candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: undefined, plainLyrics: undefined, instrumental: true });
    expect(pickBestCandidate([instrumental], query)?.candidate.instrumental).toBe(true);
  });

  it('prefers synced lyrics over plain text at an equal score', () => {
    // Same title, artist and duration, so the base score ties exactly and only the bonus decides.
    const plain = candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: undefined, plainLyrics: 'words' });
    const synced = candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261 });
    const picked = pickBestCandidate([plain, synced], query)?.candidate;
    expect(picked?.syncedLyrics).toBeDefined();
    // Order must not decide it: the plain record is first in the list.
    expect(pickBestCandidate([synced, plain], query)?.candidate.syncedLyrics).toBeDefined();
  });

  it('still prefers a much better plain-text match over a poor synced one', () => {
    // The bonus is a tie-breaker, not an override: lyrics that scroll correctly matter more than
    // scrolling at all.
    const poorSynced = candidate({ name: 'Different Song', artistName: 'Different Artist', duration: 180 });
    const goodPlain = candidate({ name: '夜に駆ける', artistName: 'YOASOBI', duration: 261, syncedLyrics: undefined, plainLyrics: 'words' });
    expect(pickBestCandidate([poorSynced, goodPlain], query)?.candidate.plainLyrics).toBe('words');
  });

  it('honours a custom threshold', () => {
    const mediocre = [candidate({ name: '夜に駆ける (Cover)', artistName: 'Someone', duration: 300 })];
    expect(pickBestCandidate(mediocre, query, { threshold: 0.99 })).toBeNull();
    expect(pickBestCandidate(mediocre, query, { threshold: 0.1 })).not.toBeNull();
  });

  it('has a threshold that rejects a title-only match but accepts a corroborated one', () => {
    // This pins the tuned value to its rationale: a bare title match is not enough evidence, a
    // title plus either an artist or a duration is.
    const titleOnly = candidate({ name: '夜に駆ける', artistName: 'Unknown Uploader', duration: 90 });
    const corroborated = candidate({ name: '夜に駆ける', artistName: 'Unknown Uploader', duration: 261 });

    expect(scoreCandidate(titleOnly, query).score).toBeLessThan(DEFAULT_MATCH_THRESHOLD);
    expect(scoreCandidate(corroborated, query).score).toBeGreaterThanOrEqual(DEFAULT_MATCH_THRESHOLD);
  });
});
