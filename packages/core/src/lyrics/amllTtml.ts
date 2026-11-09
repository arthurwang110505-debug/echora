// packages/core/src/lyrics/amllTtml.ts
//
// Parsing AMLL TTML: word-by-word lyrics.
//
// The TTML parser in `parser.ts` strips tags to get a line's text. That is correct for a subtitle
// file and wrong for this one: every word in an AMLL document is a `<span>` with its own `begin`,
// and stripping the tags throws away the entire reason the format exists.
//
// The shape this reads (one real line, one word each):
//
//   <p begin="00:18.432" end="00:25.089">
//     <span begin="00:18.432" end="00:18.818">今</span>
//     <span begin="00:18.818" end="00:19.286">天</span>
//     ...
//     <span ttm:role="x-roman">gam tin ngo</span>
//   </p>
//
// Two details matter and are easy to get wrong:
//
//   - **The romanisation span has no timing.** It is a peer of the timed spans, so a naive walk
//     either attaches it as a word at the current time or, worse, adds it to the line text and the
//     lyric shows the pinyin and the characters run together.
//   - **Word gaps are not always pieces of words.** A line usually has one span per character, but
//     a Latin line has one span per word, and the space between them is either inside a span or
//     absent. Joining spans with a space would render `今 天 我` for Chinese.

import type { Line, Word } from '../types';

/** `00:18.432`, `1:02:03.500`, and the bare-seconds form TTML also permits. */
const parseTtmlTime = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // TTML allows a comma as the decimal separator.
  const normalised = trimmed.replace(',', '.');
  const parts = normalised.split(':');
  if (parts.length < 1 || parts.length > 3) return null;

  const seconds = Number(parts[parts.length - 1]);
  if (!Number.isFinite(seconds)) return null;
  if (parts.length === 1) return seconds * 1000;

  const minutes = Number(parts[parts.length - 2]);
  if (!Number.isFinite(minutes)) return null;
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (!Number.isFinite(hours)) return null;

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
};

/** Reads an attribute from a tag's attribute string, tolerating either quote style. */
const readAttribute = (attributes: string, name: string): string | null => {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const match = pattern.exec(attributes);
  return match ? (match[2] ?? match[3] ?? '') : null;
};

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
};

/** Decodes the five XML entities plus `&nbsp;`. Titles and lyrics both contain them. */
export const decodeXmlEntities = (value: string): string => (
  value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  })
);

interface RawSpan {
  text: string;
  begin: number | null;
  end: number | null;
  role: string | null;
}

/**
 * Splits one `<p>` into its spans and its loose text.
 *
 * A `<p>` may contain text outside any span (some editors emit `Hi <span>there</span>`), which is
 * why the content is tokenised rather than assumed to be all spans.
 */
const readSpans = (inner: string): RawSpan[] => {
  const spans: RawSpan[] = [];
  const spanPattern = /<span\b([^>]*)>([\s\S]*?)<\/span>/g;
  let match: RegExpExecArray | null;

  while ((match = spanPattern.exec(inner)) !== null) {
    const attributes = match[1];
    const role = readAttribute(attributes, 'ttm:role');
    // A span may contain nested markup (occasionally `<br>`); strip it to text.
    const text = decodeXmlEntities(match[2].replace(/<[^>]+>/g, ''));
    spans.push({
      text,
      begin: parseTtmlTime(readAttribute(attributes, 'begin') ?? ''),
      end: parseTtmlTime(readAttribute(attributes, 'end') ?? ''),
      role,
    });
  }

  // Any text outside spans, kept in document order relative to the spans it sits between.
  if (spans.length === 0) {
    const text = decodeXmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
    if (text) spans.push({ text, begin: null, end: null, role: null });
  }

  return spans;
};

/**
 * Joins word texts the way the language expects.
 *
 * CJK writes without spaces, so `今` + `天` is `今天`. Latin writes with them, and a Latin line's
 * spans are words, so those need the space back. The rule is per-span: insert a separator only
 * between two spans that both end and begin with a Latin character.
 */
const LATIN = /[A-Za-z0-9'’\-]/;

const joinWords = (texts: string[]): string => {
  let result = '';
  for (const text of texts) {
    if (!text) continue;
    const previous = result.at(-1) ?? '';
    const next = text[0] ?? '';
    // In these documents the gap between CJK characters is often padded with a literal space in the
    // source (`我</span> <span>寒`). It is spacing for the editor's benefit, not a word boundary in
    // the lyric, so it is dropped unless a Latin word actually needs a separator.
    if (result && LATIN.test(previous) && LATIN.test(next)) result += ' ';
    result += text;
  }
  return result.replace(/\s{2,}/g, ' ').trim();
};

export interface ParsedAmllMetadata {
  title?: string;
  artist?: string;
  album?: string;
  /** Platform ids declared by the file, e.g. `ncmMusicId`. */
  ids: Record<string, string>;
}

export interface ParsedAmllTtml {
  lines: Line[];
  metadata: ParsedAmllMetadata;
  /** True when at least one line has more than one timed word. */
  isWordByWord: boolean;
}

/**
 * Parses one AMLL TTML document.
 *
 * Returns `null` when the document has no timed lines at all, so a malformed or empty response is
 * a miss rather than an empty lyric sheet that renders as "no lyrics" with the wrong explanation.
 */
export const parseAmllTtml = (raw: string): ParsedAmllTtml | null => {
  if (!raw || !/<tt[\s>]/.test(raw)) return null;

  const metadata: ParsedAmllMetadata = { ids: {} };
  const metaPattern = /<amll:meta\b([^>]*)\/?>/g;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaPattern.exec(raw)) !== null) {
    const key = readAttribute(metaMatch[1], 'key');
    const value = readAttribute(metaMatch[1], 'value');
    if (!key || value === null) continue;
    const decoded = decodeXmlEntities(value);
    if (key === 'musicName') metadata.title = decoded;
    else if (key === 'artists') metadata.artist = decoded;
    else if (key === 'album') metadata.album = decoded;
    else metadata.ids[key] = decoded;
  }

  const lines: Line[] = [];
  let isWordByWord = false;
  const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let paragraphMatch: RegExpExecArray | null;

  while ((paragraphMatch = paragraphPattern.exec(raw)) !== null) {
    const attributes = paragraphMatch[1];
    const lineStart = parseTtmlTime(readAttribute(attributes, 'begin') ?? '');
    const lineEnd = parseTtmlTime(readAttribute(attributes, 'end') ?? '');
    if (lineStart === null) continue;

    const spans = readSpans(paragraphMatch[2]);
    // Annotation text arrives with irregular spacing (`gam tin ngo  hon je lei`); collapsing it
    // keeps the romanised line from rendering with a visible double gap.
    const squash = (value: string) => value.replace(/\s+/g, ' ').trim();
    const romanisation = squash(spans.filter(span => span.role === 'x-roman').map(span => span.text).join(' '));
    const translation = squash(spans.filter(span => span.role === 'x-translation').map(span => span.text).join(' '));
    // `x-roman` and `x-translation` are annotations, never sung words.
    const wordSpans = spans.filter(span => span.role === null || (span.role !== 'x-roman' && span.role !== 'x-translation' && span.role !== 'x-bg'));

    const timedSpans = wordSpans.filter(span => span.begin !== null);
    const fullText = joinWords(wordSpans.map(span => span.text.trim()));
    if (!fullText) continue;

    let words: Word[];
    if (timedSpans.length > 1) {
      isWordByWord = true;
      words = timedSpans.map((span, index) => {
        const startTime = span.begin as number;
        // A missing `end` is filled from the next word's begin; the last word is filled from the line.
        const nextStart = timedSpans[index + 1]?.begin ?? lineEnd ?? startTime;
        const endTime = span.end ?? nextStart;
        return { text: span.text, startTime, endTime: Math.max(endTime, startTime) };
      });
    } else {
      // One word for the whole line, which is what the LRC path produces too; the visualizers
      // handle it, and inventing word boundaries from character counts would be a guess.
      const endTime = lineEnd ?? lineStart + Math.max(1000, fullText.length * 200);
      words = [{ text: fullText, startTime: lineStart, endTime }];
    }

    lines.push({
      fullText,
      startTime: lineStart,
      endTime: lineEnd ?? words[words.length - 1]?.endTime ?? lineStart,
      words,
      ...(translation ? { translation } : {}),
      ...(romanisation ? { romanization: romanisation } : {}),
    });
  }

  if (lines.length === 0) return null;
  lines.sort((a, b) => a.startTime - b.startTime);
  return { lines, metadata, isWordByWord };
};

/** Rewrites `?format=ttml` documents from short time notation if a source ever omits the unit. */
export const hasTimedWords = (lines: Line[]): boolean => (
  lines.some(line => line.words.length > 1 && line.words.some(word => word.startTime > line.startTime))
);
