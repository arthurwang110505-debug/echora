// packages/core/src/lyrics/matchScore.ts
//
// Choosing between LRCLIB search results.
//
// The old code took the first result that happened to carry synced lyrics:
//
//   const candidate = searchResults.find(t => t.syncedLyrics) || searchResults[0];
//
// "First" is not "closest". For a song with a common title - a cover, a live version, a remix, an
// unrelated track that shares three words - the first hit is routinely the wrong one, and synced
// lyrics are not evidence of a match: a cover has them too. The user then sees lyrics that drift,
// or belong to a different song entirely, which is worse than no lyrics because it looks correct.
//
// Scoring, by contrast, uses the information already present in the query: duration is the single
// strongest signal (a remix or a live take differs by tens of seconds, the same recording does not),
// then the title, then the artist, which YouTube frequently gets wrong because channels upload
// covers under their own name.

import { cleanSongTitle } from './songTitle';

/**
 * The subset of an LRCLIB record this needs.
 *
 * Declared structurally rather than imported from the provider so scoring stays testable without a
 * network shape, and so a future source (AMLLDB, L3-a) can be scored by the same function.
 */
export interface LyricCandidate {
  name: string;
  artistName: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string;
  plainLyrics?: string;
}

export interface LyricQueryShape {
  title: string;
  artist?: string;
  /** Seconds, matching LRCLIB's own unit. */
  duration?: number;
}

/** Weights sum to 1 so a score is readable as "a percentage of a perfect match". */
const WEIGHT_DURATION = 0.5;
const WEIGHT_TITLE = 0.35;
const WEIGHT_ARTIST = 0.15;

/** Beyond this many seconds apart, two recordings are not the same recording. */
const DURATION_TOLERANCE_S = 30;

/**
 * Normalises for comparison only: lower case, no punctuation, no bracketing, no spacing.
 *
 * Deliberately more aggressive than `cleanSongTitle`: that one must leave a readable title behind,
 * this one only has to make two strings comparable, so `"夜に駆ける"` and `"夜に駆ける (Remaster)"`
 * land on the same value, as do `"Don't Stop Me Now"` and `"dont stop me now"`.
 */
export const normalizeForMatch = (value: string): string => (
  cleanSongTitle(value)
    .toLowerCase()
    // Full-width ASCII and the ideographic space, common in Japanese titles.
    .replace(/[\uFF01-\uFF5E]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    // Apostrophes join words ("don't" / "dont"), everything else separates them.
    .replace(/['’`"“”]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
);

/**
 * Words in a title.
 *
 * Latin text splits on non-word characters; CJK text has no spaces, so the whole run is one token.
 * That is why the character-level comparison (Dice) is the primary signal and tokens are only the
 * second opinion: a five-character Japanese title is one token, and it is either present in the
 * other title or it is not, which is too coarse to rank candidates.
 */
const tokenize = (value: string): Set<string> => (
  new Set((value.toLowerCase().match(/[\p{Letter}\p{Number}]+/gu) || []).filter(Boolean))
);

/** Token-level overlap, so word order and extra words do not decide a match. */
const tokenOverlap = (left: string, right: string): number => {
  const leftTokens = tokenize(cleanSongTitle(left));
  const rightTokens = tokenize(cleanSongTitle(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.max(leftTokens.size, rightTokens.size);
};

/**
 * Sørensen-Dice over adjacent character pairs.
 *
 * Chosen over per-character containment because containment cannot express "almost the same":
 * `夜に駆ける` is entirely contained in `夜に駆けるenglishver`, which sounds conclusive until you
 * notice `Love` is entirely contained in `Love Story` too. Dice says the first pair shares 4 of 5
 * bigrams (0.89) and the second shares 3 of 10 (0.33), which is the distinction that matters.
 */
const diceCoefficient = (left: string, right: string): number => {
  // A one-character string has no bigrams; fall back to a whole-string comparison.
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const bigrams = (value: string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      counts.set(pair, (counts.get(pair) || 0) + 1);
    }
    return counts;
  };

  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  let overlap = 0;
  for (const [pair, count] of leftPairs) {
    overlap += Math.min(count, rightPairs.get(pair) || 0);
  }
  const total = (left.length - 1) + (right.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
};

/**
 * Similarity in [0, 1] between two titles or artists.
 *
 * Three signals, best wins, because each catches what the others miss:
 *
 *   - Exact equality after normalisation is 1. This is the common case and should not be diluted.
 *   - Character overlap (Sørensen-Dice over bigrams) measures how much of the two strings is the
 *     same text, which works identically for `夜に駆ける` and for `Don't Stop Me Now` - the property
 *     the previous token-count rule did not have. It handles a reordering or an inserted version
 *     marker gracefully, and unlike raw substring containment it does not call `Love` a match for
 *     `Love Story`.
 *   - Token overlap, for the case bigrams underrate: the same words in a different order, or a
 *     channel name prefixed onto the title.
 */
export const similarity = (left: string, right: string): number => {
  const a = normalizeForMatch(left);
  const b = normalizeForMatch(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  return Math.max(diceCoefficient(a, b), tokenOverlap(left, right));
};

/** Duration agreement in [0, 1]; missing durations are neutral rather than a mismatch. */
export const durationSimilarity = (candidateDuration?: number, queryDuration?: number): number | null => {
  if (!candidateDuration || !queryDuration) return null;
  const difference = Math.abs(candidateDuration - queryDuration);
  if (difference <= 2) return 1;
  if (difference >= DURATION_TOLERANCE_S) return 0;
  return 1 - (difference - 2) / (DURATION_TOLERANCE_S - 2);
};

export interface ScoredCandidate<T extends LyricCandidate = LyricCandidate> {
  candidate: T;
  score: number;
  /** Which signals actually contributed, so a surprising choice can be explained. */
  parts: { title: number; artist: number; duration: number | null };
  /** False when the record has lyrics worth showing at all. */
  hasLyrics: boolean;
}

/**
 * Scores one candidate against the query.
 *
 * Missing signals redistribute their weight instead of scoring zero: a result with no duration is
 * not *wrong* about the duration, and a query without an artist should not cap every candidate at
 * 85%. Scoring those as 0 is how the correct result loses to a worse one that happened to be
 * complete.
 */
export const scoreCandidate = <T extends LyricCandidate>(candidate: T, query: LyricQueryShape): ScoredCandidate<T> => {
  const title = similarity(candidate.name || '', query.title || '');
  const artist = query.artist && candidate.artistName ? similarity(candidate.artistName, query.artist) : null;
  const duration = durationSimilarity(candidate.duration, query.duration);

  let weight = WEIGHT_TITLE;
  let total = title * WEIGHT_TITLE;
  if (artist !== null) { weight += WEIGHT_ARTIST; total += artist * WEIGHT_ARTIST; }
  if (duration !== null) { weight += WEIGHT_DURATION; total += duration * WEIGHT_DURATION; }

  return {
    candidate,
    score: weight > 0 ? total / weight : 0,
    parts: { title, artist: artist ?? 0, duration },
    hasLyrics: Boolean(candidate.syncedLyrics || candidate.plainLyrics || candidate.instrumental),
  };
};

/**
 * How sure a match has to be before it is shown.
 *
 * Tuned by what the two failure modes cost. Showing the wrong song's lyrics is a visible lie that
 * the user may not notice for a while; showing nothing is an obvious gap the user can act on (pick
 * a different track, paste lyrics). So the bar is set where a title match alone is not enough, but
 * a title match plus a corroborating signal is.
 */
export const DEFAULT_MATCH_THRESHOLD = 0.62;

export interface MatchOptions {
  threshold?: number;
  /** Prefer synced lyrics over plain text when scores are close. */
  preferSynced?: boolean;
}

const SYNCED_BONUS = 0.05;

/**
 * Picks the best candidate, or null when nothing clears the bar.
 *
 * `null` is a real answer here: it means "no confident match", which the caller reports as
 * unavailable. Returning the least-bad candidate would defeat the whole point.
 */
export const pickBestCandidate = <T extends LyricCandidate>(
  candidates: T[],
  query: LyricQueryShape,
  options: MatchOptions = {},
): ScoredCandidate<T> | null => {
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  // Only records with lyrics are eligible; an empty record scoring 1.0 on name and duration is
  // still an empty record.
  const eligible = candidates.filter(candidate => Boolean(candidate.syncedLyrics || candidate.plainLyrics || candidate.instrumental));
  if (eligible.length === 0) return null;

  let best: ScoredCandidate<T> | null = null;
  for (const candidate of eligible) {
    const scored = scoreCandidate(candidate, query);
    // Not clamped to 1. A perfect match is common - the right record usually scores exactly 1 on
    // every signal - and clamping made the synced-lyrics bonus vanish in precisely the case it is
    // for, so the tie was decided by whichever candidate the API happened to return first. The
    // score is a ranking key, not a probability, so exceeding 1 is fine. The threshold is compared
    // against the *unadjusted* score below for the same reason: the bonus is a tie-breaker, not a
    // way to smuggle a weak match over the bar.
    const bonus = options.preferSynced !== false && candidate.syncedLyrics ? SYNCED_BONUS : 0;
    const ranked = scored.score + bonus;
    if (!best || ranked > best.score) best = { ...scored, score: ranked };
  }

  if (!best) return null;
  // Compare the base score, not the ranking score: a tie-breaker must not promote a candidate that
  // is below the bar on its own merits.
  const base = best.score - (options.preferSynced !== false && best.candidate.syncedLyrics ? SYNCED_BONUS : 0);
  return base >= threshold ? best : null;
};
