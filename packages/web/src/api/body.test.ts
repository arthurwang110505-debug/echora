// packages/web/src/api/body.test.ts
//
// The body reader's two bugs, both from the review: chunk-by-chunk `String(chunk)` corrupts any
// character that straddles a chunk boundary, and counting UTF-16 units instead of bytes lets a body
// three times the limit through when the text is Chinese.
import { describe, expect, it } from 'vitest';
import { BodyError, readJsonBody } from '@api/_lib/body';

/** A request whose body arrives as the chunks given, the way `vite dev` presents it. */
const streamOf = (chunks: Buffer[], headers: Record<string, string> = {}) => ({
  headers,
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) yield chunk;
  },
});

describe('readJsonBody', () => {
  it('prefers a body Vercel already parsed', async () => {
    await expect(readJsonBody({ headers: {}, body: { a: 1 } }, 1000)).resolves.toEqual({ a: 1 });
  });

  it('decodes a multi-byte character split across chunks', async () => {
    // "歌" is e8 a6 8c. Splitting it is exactly what a full socket buffer does.
    const full = Buffer.from(JSON.stringify({ lyrics: '歌詞' }), 'utf8');
    const cut = 3; // inside the first character
    const body = await readJsonBody(streamOf([full.subarray(0, cut), full.subarray(cut)]), 10_000);
    expect(body).toEqual({ lyrics: '歌詞' });
  });

  it('holds when every byte arrives separately', async () => {
    const full = Buffer.from(JSON.stringify({ t: '晚安世界' }), 'utf8');
    const chunks = Array.from(full, byte => Buffer.from([byte]));
    await expect(readJsonBody(streamOf(chunks), 10_000)).resolves.toEqual({ t: '晚安世界' });
  });

  it('counts bytes, not characters, against the limit', async () => {
    // 400 Chinese characters is 1200 bytes: over a 1000-byte cap, well under it if miscounted.
    const body = JSON.stringify({ t: '歌'.repeat(400) });
    expect(Buffer.byteLength(body)).toBeGreaterThan(1000);
    await expect(readJsonBody(streamOf([Buffer.from(body)]), 1000)).rejects.toBeInstanceOf(BodyError);
  });

  it('refuses an oversized declared length before reading', async () => {
    await expect(readJsonBody(streamOf([], { 'content-length': '999999' }), 1000))
      .rejects.toThrow('請求內容過大');
  });

  it('reports a size violation as 413, not as a caller mistake', async () => {
    const error = await readJsonBody(streamOf([Buffer.alloc(2000, 0x20)]), 1000).catch(value => value);
    expect(error).toBeInstanceOf(BodyError);
    expect((error as BodyError).status).toBe(413);
  });

  it('rejects malformed JSON as 400', async () => {
    const error = await readJsonBody(streamOf([Buffer.from('{oops')]), 1000).catch(value => value);
    expect((error as BodyError).status).toBe(400);
  });

  it('treats an empty stream as an empty object', async () => {
    await expect(readJsonBody(streamOf([]), 1000)).resolves.toEqual({});
  });

  it('strips a BOM, which would otherwise fail the parse', async () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')]);
    await expect(readJsonBody(streamOf([body]), 1000)).resolves.toEqual({ a: 1 });
  });

  it('refuses an array body, which no route accepts', async () => {
    await expect(readJsonBody(streamOf([Buffer.from('[1,2]')]), 1000)).resolves.toEqual({});
  });
});
