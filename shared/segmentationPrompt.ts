// shared/segmentationPrompt.ts
//
// The word-segmentation prompt and its response parser, shared by the browser client and the
// serverless endpoint. Ported from upstream Folia's `shared/lyricSegmentationPrompt.mjs`, where the
// same module feeds the browser, the Vercel handler and a worker — the reason it lives at the repo
// root rather than inside one of them is so "run it for me" and "give me the prompt to paste
// myself" cannot drift apart.
//
// Only the JSON path is kept. Upstream also accepts a delimited plain-text answer because its own
// Gemini/OpenAI plumbing may fall back to prose; Echora asks for JSON only and validates it here.

/** Word boundary marker in the plain-text exchange format. Kept in sync with segmentationRecord.ts */
export const SEGMENTATION_DELIMITER = '/';

/** Upper bound on model output. Output runs ~18 tokens per line, so a 100-line batch lands near 1800. */
export const SEGMENTATION_MAX_OUTPUT_TOKENS = 8192;

export interface SegmentationParseResult {
    /** One entry per input line: the line's boundaries, or null when the model got that line wrong. */
    boundaries: (string[] | null)[];
    /** Human-readable reason per rejected line, for logs and the failure count shown to the user. */
    rejections: string[];
}

// Rules 4 and 5 and the Japanese example rows are load-bearing for weaker models. With only the
// Chinese and English examples, a model reads the English row as "split at spaces" and applies that
// to everything: measured upstream on deepseek-v4-flash over 19 Japanese lines, 5–10 came back as a
// single segment (1.6–2.4 segments per line where Intl.Segmenter gives 7). An abstract "never return
// a whole clause" rule alone changed nothing; the Japanese rule together with two Japanese example
// rows moved it to 1 unsplit line at 3.8 segments. It is not a Japanese-only patch: with them,
// Chinese stopped being over-split (摘不下 and 盒子里 survive as one segment) and English output was
// byte-identical. The bracket clause in rule 7 pays for itself: without it the added rules pull
// (拼图女孩) apart into three segments.
export const SEGMENTATION_SYSTEM_PROMPT = [
    'You segment song lyrics into words for a typography engine.',
    '',
    'You receive numbered lyric lines. For each line, split it into the units a human reader would',
    'treat as single words, and return them in order.',
    '',
    'Hard rules, in priority order:',
    '1. Lossless. Concatenating one line’s segments must reproduce that line character for character,',
    '   including every space, punctuation mark and symbol. Never add, drop, reorder or normalise a',
    '   character. Never translate, romanise, or correct spelling.',
    '2. Same count. Return exactly one segment array per input line, in the same order.',
    '3. Split at meaning, not at characters. For Chinese, Japanese and Korean, group characters into',
    '   real words and set phrases (不知道 / 孤独的 / キラキラ), not one character per segment.',
    '   Keep verb–complement and noun–suffix pairs together when they read as one word.',
    '4. One word per segment. A segment carries a single content word plus the grammatical tail glued',
    '   to it. If a segment still holds a second noun, verb or adjective, split it again. Spaces are',
    '   not the only split points: a Japanese or Chinese line usually has none and still needs one',
    '   segment per word. Returning a whole clause, or a whole line, as one segment is a failure.',
    '5. Japanese specifically: split before every content word, and keep each content word together',
    '   with the okurigana, auxiliaries and particles that follow it (見えない / ように / 集めたい /',
    '   けど). Sentence-final particles (よ / ね / さ) attach to what precedes them.',
    '6. Keep space-delimited words whole for Latin scripts, and keep contractions such as it’s or',
    '   don’t in one segment.',
    '7. Attach trailing punctuation to the segment it follows (世界。 not 世界 + 。). A bracket or quote',
    '   stays in one segment with the text it wraps ((拼图女孩) not ( + 拼图女孩 + )). A space belongs',
    '   to the segment that precedes it.',
    '8. The "N. " prefix on each input line is numbering added by this request. It is NOT part of the',
    '   lyric. Never include it in a segment.',
    '',
    'Examples. Given:',
    '  1. 把回忆拼好给你',
    '  2. It’s unbelievable, isn’t it?',
    '  3. いっぱいあるんだよ欲しいもの',
    '  4. 見えないようにさ 隠しても',
    'answer exactly:',
    '  {"lines": [["把", "回忆", "拼好", "给", "你"], ["It’s ", "unbelievable, ", "isn’t ", "it?"],'
    + ' ["いっぱい", "あるんだよ", "欲しい", "もの"], ["見えない", "ように", "さ ", "隠しても"]]}',
    '',
    'Respond with JSON only: {"lines": [["seg", "seg"], ["seg"]]}. No prose, no code fence.',
].join('\n');

/** The exact instructions a user copies out, so the pasted path asks for the same thing. */
export const buildSegmentationSystemPrompt = (): string => SEGMENTATION_SYSTEM_PROMPT;

/** The numbered lyric block. Numbering makes a dropped line visible in the model's own output. */
export const buildSegmentationSourcePrompt = (lines: string[]): string => {
    const numbered = lines.map((text, index) => `${index + 1}. ${text}`).join('\n');
    return `Segment these ${lines.length} lyric lines.\n\n${numbered}`;
};

/** What a user copies to a model site: the rules and the lines, with the input format spelled out. */
export const buildSegmentationManualPrompt = (lines: string[]): string => [
    SEGMENTATION_SYSTEM_PROMPT,
    '',
    `If you cannot produce JSON, answer with ${lines.length} plain lines instead, separating words`,
    `with "${SEGMENTATION_DELIMITER}" and nothing else.`,
    '',
    buildSegmentationSourcePrompt(lines),
].join('\n');

const stripCodeFence = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('```')) return trimmed;
    return trimmed.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '');
};

const MAX_DIAGNOSTIC_CHARS = 160;

const clip = (text: string): string => (
    text.length > MAX_DIAGNOSTIC_CHARS ? `${text.slice(0, MAX_DIAGNOSTIC_CHARS)}…` : text
);

/** First index where two strings diverge, or -1 when they are equal. */
const firstDifference = (expected: string, got: string): number => {
    const limit = Math.min(expected.length, got.length);
    for (let index = 0; index < limit; index += 1) {
        if (expected[index] !== got[index]) return index;
    }
    return expected.length === got.length ? -1 : limit;
};

/**
 * Rebuilds the model's split points as slices of the original line.
 *
 * Models reliably get the *split points* right and just as reliably normalise whitespace on the way
 * back — a trailing space dropped, a full-width space folded to an ASCII one, a double space
 * collapsed. Comparing the joined string to the line rejected all of that, so one cosmetic
 * difference on one line threw away a whole song.
 *
 * So instead of trusting the returned text, only its boundaries are trusted: walk the original,
 * consume each segment's non-whitespace characters from it, and let the original's own whitespace
 * fall wherever it actually is. Every emitted segment is therefore a slice of `text`, and their
 * concatenation is `text` by construction rather than by the model's good behaviour.
 *
 * Returns null when the non-whitespace content genuinely differs — a rewritten, translated or
 * dropped word — which is the case that must still fail.
 */
export const realignSegmentsToText = (boundaries: string[], text: string): string[] | null => {
    if (boundaries.join('') === text) return boundaries;

    const slices: string[] = [];
    let cursor = 0;

    for (const boundary of boundaries) {
        const wanted = boundary.replace(/\s+/gu, '');
        // A whitespace-only segment carries no content of its own; the surrounding slices pick up
        // whatever whitespace the original actually has at that position.
        if (!wanted) continue;

        const start = cursor;
        let matched = 0;
        while (cursor < text.length && matched < wanted.length) {
            const char = text[cursor];
            if (/\s/u.test(char)) {
                cursor += 1;
                continue;
            }
            if (char !== wanted[matched]) return null;
            matched += 1;
            cursor += 1;
        }

        if (matched < wanted.length) return null;
        slices.push(text.slice(start, cursor));
    }

    if (slices.length === 0) return null;

    // Whatever is left must be whitespace; it belongs to the final segment.
    const tail = text.slice(cursor);
    if (tail.trim()) return null;
    slices[slices.length - 1] += tail;

    return slices;
};

/**
 * Turns a model response into boundary rows, one per input line.
 *
 * Rows the model got wrong come back as `null` rather than throwing. Which model this is cannot be
 * known — the endpoint's model name is free text — so some rate of imperfect lines has to be
 * assumed, and one mangled line out of forty killing the whole song is the wrong trade: a null keeps
 * that line on the default split, which is correct output, while the rest still improve.
 *
 * What still throws is anything structural — not JSON, no `lines` array, the wrong number of rows —
 * because then the mapping from row to lyric line is unknown and nothing can be trusted.
 */
export const parseSegmentationResponse = (raw: string, lines: string[]): SegmentationParseResult => {
    const text = stripCodeFence(String(raw ?? ''));
    if (!text) throw new Error('Empty segmentation response');

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`Segmentation response was not valid JSON: ${clip(text)}`);
    }

    const rows = Array.isArray(parsed) ? parsed : (parsed as { lines?: unknown } | null)?.lines;
    if (!Array.isArray(rows)) throw new Error('Segmentation response had no "lines" array');
    if (rows.length !== lines.length) {
        throw new Error(`Segmentation response had ${rows.length} lines, expected ${lines.length}`);
    }

    const boundaries: (string[] | null)[] = [];
    const rejections: string[] = [];

    rows.forEach((row, index) => {
        if (!Array.isArray(row)) {
            boundaries.push(null);
            rejections.push(`line ${index + 1} was not an array`);
            return;
        }

        const realigned = realignSegmentsToText(row.map(segment => String(segment)), lines[index]);
        if (realigned) {
            boundaries.push(realigned);
            return;
        }

        const got = row.join('');
        const at = firstDifference(lines[index], got);
        boundaries.push(null);
        rejections.push(
            `line ${index + 1} does not reproduce the original text (first difference at character ${at + 1});`
            + ` expected ${JSON.stringify(clip(lines[index]))} got ${JSON.stringify(clip(got))}`,
        );
    });

    if (rejections.length === rows.length) {
        throw new Error(`Segmentation reproduced none of the lines. First problem: ${rejections[0]}`);
    }

    return { boundaries, rejections };
};
