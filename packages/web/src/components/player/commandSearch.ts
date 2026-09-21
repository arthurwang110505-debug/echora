// src/components/player/commandSearch.ts
// Fuzzy command matching for the Ctrl/Cmd+K palette.
//
// Upstream Folia matches Chinese, English, pinyin and pinyin initials. Echora ships no pinyin
// table, so matching here is: normalised substring first, then subsequence — over whatever
// keyword strings a command declares (which is where any extra aliases, pinyin included, can be
// added without touching the matcher).

export type SearchableCommand = {
  id: string;
  keywords: string[];
};

const normalize = (value: string) => value.trim().toLowerCase();

/** Subsequence check that also reports how spread out the match is (fewer gaps = better). */
const subsequenceSpread = (query: string, haystack: string) => {
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const char of query) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    if (first === -1) first = found;
    last = found;
    cursor = found + 1;
  }
  return last - first;
};

/**
 * Returns 0 when nothing matches. Higher is better:
 *   200+  exact/starts-with hit (earlier position wins)
 *   100+  substring anywhere
 *    50+  subsequence (tighter spread wins)
 */
export function scoreCommand(query: string, command: SearchableCommand): number {
  const needle = normalize(query);
  if (!needle) return 1;

  let best = 0;
  for (const raw of command.keywords) {
    const haystack = normalize(raw);
    if (!haystack) continue;

    const at = haystack.indexOf(needle);
    if (at !== -1) {
      best = Math.max(best, (at === 0 ? 200 : 100) + Math.max(0, 60 - at));
      continue;
    }

    const spread = subsequenceSpread(needle, haystack);
    if (spread !== null) {
      best = Math.max(best, 50 + Math.max(0, 40 - spread));
    }
  }
  return best;
}

/** Ranks commands by score, dropping non-matches. An empty query keeps the declared order. */
export function searchCommands<T extends SearchableCommand>(query: string, commands: T[]): T[] {
  if (!normalize(query)) return commands;
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(query, command) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(entry => entry.command);
}
