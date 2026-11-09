import { describe, expect, it } from 'vitest';
import { decodeXmlEntities, hasTimedWords, parseAmllTtml } from './amllTtml';

/**
 * The document below is trimmed from a real file in `amll-dev/amll-ttml-db`
 * (`ncm-lyrics/347230.ttml`, Beyond - 海阔天空). Two lines, character-timed, with a romanisation
 * span that has no timing at all. Everything asserted here is a property of that real shape.
 */
const REAL_DOCUMENT = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns:amll="http://www.example.com/ns/amll"><head><metadata xmlns=""><ttm:agent type="person" xml:id="v1"/><amll:meta key="ncmMusicId" value="347230"/><amll:meta key="musicName" value="海阔天空"/><amll:meta key="artists" value="Beyond"/><amll:meta key="album" value="海阔天空"/></metadata></head><body dur="04:22.928"><div xmlns="" begin="00:18.432" end="04:22.928"><p begin="00:18.432" end="00:25.089" ttm:agent="v1" itunes:key="L1"><span begin="00:18.432" end="00:18.818">今</span><span begin="00:18.818" end="00:19.286">天</span><span begin="00:19.286" end="00:21.968">我</span> <span begin="00:21.968" end="00:22.142">寒</span><span begin="00:22.142" end="00:22.299">夜</span><span begin="00:22.299" end="00:22.715">里</span><span begin="00:22.715" end="00:22.835">看</span><span begin="00:22.835" end="00:23.450">雪</span><span begin="00:23.450" end="00:23.912">飘</span><span begin="00:23.912" end="00:25.089">过</span><span ttm:role="x-roman">gam tin ngo  hon je lei hon syut piu gwo</span></p><p begin="00:25.089" end="00:30.885" ttm:agent="v1" itunes:key="L2"><span begin="00:25.089" end="00:25.254">怀</span><span begin="00:25.254" end="00:25.431">着</span><span begin="00:25.431" end="00:25.841">冷</span><span begin="00:25.841" end="00:25.989">却</span><span begin="00:25.989" end="00:26.570">了</span><span begin="00:26.570" end="00:26.973">的</span><span begin="00:26.973" end="00:27.366">心</span><span begin="00:27.366" end="00:27.780">窝</span><span begin="00:27.780" end="00:27.928">漂</span><span begin="00:27.928" end="00:28.497">远</span><span begin="00:28.497" end="00:30.885">方</span><span ttm:role="x-roman">waai zoek laang koek liu dik sam wo piu jyun fong</span></p></div></body></tt>`;

describe('parseAmllTtml: timing', () => {
  it('keeps each word as its own timed unit', () => {
    // The whole reason this parser exists: `parser.ts` strips the spans and returns one word for
    // the line, which throws away the karaoke timing that is the point of the format.
    const parsed = parseAmllTtml(REAL_DOCUMENT);
    expect(parsed?.isWordByWord).toBe(true);

    const firstLine = parsed!.lines[0];
    expect(firstLine.words.length).toBeGreaterThan(1);
    expect(firstLine.words[0]).toMatchObject({ text: '今', startTime: 18_432, endTime: 18_818 });
    expect(firstLine.words[1]).toMatchObject({ text: '天', startTime: 18_818, endTime: 19_286 });
  });

  it('reads millisecond precision rather than rounding to seconds', () => {
    const firstLine = parseAmllTtml(REAL_DOCUMENT)!.lines[0];
    expect(firstLine.startTime).toBe(18_432);
    expect(firstLine.endTime).toBe(25_089);
  });

  it('covers the line with its words, and orders them', () => {
    const firstLine = parseAmllTtml(REAL_DOCUMENT)!.lines[0];
    expect(firstLine.words[0].startTime).toBe(firstLine.startTime);
    expect(firstLine.words.at(-1)!.endTime).toBe(firstLine.endTime);
    for (let index = 1; index < firstLine.words.length; index += 1) {
      expect(firstLine.words[index].startTime).toBeGreaterThanOrEqual(firstLine.words[index - 1].startTime);
    }
  });

  it('fills a missing word end from the next word', () => {
    // Some documents omit `end` on words; a zero-length word would never light up.
    const doc = '<tt><body><div><p begin="00:01.000" end="00:03.000">'
      + '<span begin="00:01.000">A</span><span begin="00:02.000" end="00:03.000">B</span></p></div></body></tt>';
    const line = parseAmllTtml(doc)!.lines[0];
    expect(line.words[0].endTime).toBe(2_000);
  });

  it('never produces a word that ends before it starts', () => {
    const doc = '<tt><body><div><p begin="00:01.000" end="00:03.000">'
      + '<span begin="00:02.000" end="00:01.500">A</span><span begin="00:03.000" end="00:03.000">B</span></p></div></body></tt>';
    for (const word of parseAmllTtml(doc)!.lines[0].words) {
      expect(word.endTime).toBeGreaterThanOrEqual(word.startTime);
    }
  });
});

describe('parseAmllTtml: text', () => {
  it('does not put spaces between CJK characters', () => {
    // Joining every span with a space would render `今 天 我 寒 夜 里…`, which is not the lyric.
    expect(parseAmllTtml(REAL_DOCUMENT)!.lines[0].fullText).toBe('今天我寒夜里看雪飘过');
  });

  it('drops the editor padding between CJK spans', () => {
    // The source has a literal space between `我` and `寒` (`我</span> <span>寒`). It is spacing
    // for the author's benefit, not a word gap in a language that has none.
    expect(parseAmllTtml(REAL_DOCUMENT)!.lines[0].fullText).not.toMatch(/\s/);
  });

  it('joins Latin words with spaces', () => {
    const doc = '<tt><body><div><p begin="00:01.000" end="00:02.000">'
      + '<span begin="00:01.000" end="00:01.400">Hello</span><span begin="00:01.400" end="00:02.000">world</span></p></div></body></tt>';
    expect(parseAmllTtml(doc)!.lines[0].fullText).toBe('Hello world');
  });

  it('keeps the romanisation off the sung text', () => {
    // A naive walk attaches `x-roman` as a word and the line reads `…飘过 gam tin ngo hon je lei…`.
    const line = parseAmllTtml(REAL_DOCUMENT)!.lines[0];
    expect(line.fullText).not.toContain('gam tin');
    expect(line.romanization).toBe('gam tin ngo hon je lei hon syut piu gwo');
  });

  it('keeps a translation span as a translation', () => {
    const doc = '<tt><body><div><p begin="00:01.000" end="00:02.000">'
      + '<span begin="00:01.000" end="00:02.000">夜に駆ける</span>'
      + '<span ttm:role="x-translation">Into the night</span></p></div></body></tt>';
    const line = parseAmllTtml(doc)!.lines[0];
    expect(line.fullText).toBe('夜に駆ける');
    expect(line.translation).toBe('Into the night');
  });

  it('decodes XML entities in the sung text', () => {
    const doc = '<tt><body><div><p begin="00:01.000" end="00:02.000">'
      + '<span begin="00:01.000" end="00:02.000">Tom &amp; Jerry</span></p></div></body></tt>';
    expect(parseAmllTtml(doc)!.lines[0].fullText).toBe('Tom & Jerry');
  });
});

describe('parseAmllTtml: metadata', () => {
  it('reads the song identity the file declares', () => {
    const parsed = parseAmllTtml(REAL_DOCUMENT)!;
    expect(parsed.metadata.title).toBe('海阔天空');
    expect(parsed.metadata.artist).toBe('Beyond');
    expect(parsed.metadata.album).toBe('海阔天空');
  });

  it('keeps every platform id, because that is how a match is verified', () => {
    const parsed = parseAmllTtml(REAL_DOCUMENT)!;
    expect(parsed.metadata.ids.ncmMusicId).toBe('347230');
  });
});

describe('parseAmllTtml: rejection', () => {
  it('returns null for something that is not TTML', () => {
    expect(parseAmllTtml('')).toBeNull();
    expect(parseAmllTtml('<html><body>404</body></html>')).toBeNull();
    expect(parseAmllTtml('[00:01.00] an lrc file')).toBeNull();
  });

  it('returns null when there are no timed lines', () => {
    // An empty lyric sheet would render as "no lyrics" with the wrong explanation. A miss is better.
    expect(parseAmllTtml('<tt><body><div></div></body></tt>')).toBeNull();
  });

  it('skips a paragraph with no text instead of emitting a blank line', () => {
    const doc = '<tt><body><div>'
      + '<p begin="00:01.000" end="00:02.000"><span begin="00:01.000" end="00:02.000"> </span></p>'
      + '<p begin="00:03.000" end="00:04.000"><span begin="00:03.000" end="00:04.000">real</span></p>'
      + '</div></body></tt>';
    const parsed = parseAmllTtml(doc)!;
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].fullText).toBe('real');
  });
});

describe('parseAmllTtml: single-word lines', () => {
  it('gives a one-span line a single full-width word', () => {
    // A line with one timed span has no word timing to show; inventing boundaries from character
    // counts would put the highlight in the wrong place.
    const doc = '<tt><body><div><p begin="00:01.000" end="00:03.000">'
      + '<span begin="00:01.000" end="00:03.000">whole line</span></p></div></body></tt>';
    const parsed = parseAmllTtml(doc)!;
    expect(parsed.isWordByWord).toBe(false);
    expect(parsed.lines[0].words).toHaveLength(1);
    expect(parsed.lines[0].words[0]).toMatchObject({ text: 'whole line', startTime: 1_000, endTime: 3_000 });
  });

  it('invents a plausible end when the document gives none', () => {
    const doc = '<tt><body><div><p begin="00:01.000"><span begin="00:01.000">no end anywhere</span></p></div></body></tt>';
    const line = parseAmllTtml(doc)!.lines[0];
    expect(line.endTime).toBeGreaterThan(line.startTime);
  });
});

describe('decodeXmlEntities', () => {
  it.each([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&apos;', "'"],
    ['&#39;', "'"],
    ['&#x4ECA;', '今'],
    ['&nothing;', '&nothing;'],
  ])('%s → %s', (input, expected) => {
    expect(decodeXmlEntities(input)).toBe(expected);
  });
});

describe('hasTimedWords', () => {
  it('is true only when words start after the line does', () => {
    const parsed = parseAmllTtml(REAL_DOCUMENT)!;
    expect(hasTimedWords(parsed.lines)).toBe(true);
  });

  it('is false when every word starts with the line', () => {
    expect(hasTimedWords([{ fullText: 'x', startTime: 0, endTime: 100, words: [{ text: 'x', startTime: 0, endTime: 100 }] }])).toBe(false);
  });
});
