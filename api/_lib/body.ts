// api/_lib/body.ts
//
// Reading a JSON request body with a size limit.
//
// The two AI routes each carried a copy of this, and both copies were wrong in the same way:
//
//   for await (const chunk of request) {
//     received += String(chunk).length;
//     raw += String(chunk);
//   }
//
// `String(chunk)` decodes each chunk on its own, so a multi-byte character split across a chunk
// boundary - every Chinese lyric line risks it, because UTF-8 uses three bytes per character and a
// chunk can end anywhere - decodes as two replacement characters. It also counts UTF-16 code units
// instead of bytes, so a body of Chinese text could be three times the stated limit before the cap
// fired.
//
// Collecting Buffers and decoding once fixes both: the byte count is a byte count, and the decoder
// sees the whole sequence.

/** Thrown for anything the caller sent wrong, as opposed to anything that went wrong. */
export class BodyError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BodyError';
    this.status = status;
  }
}

type BodyRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
};

/**
 * Parses the request body as JSON, refusing anything larger than `maxBytes`.
 *
 * Vercel parses the body before the function runs, so `request.body` is usually already an object;
 * that path is tried first and the stream is only read when it is not. The streaming path is what
 * `vite dev` exercises, and it is the one that used to corrupt Chinese text.
 */
export const readJsonBody = async (request: BodyRequest, maxBytes: number): Promise<Record<string, unknown>> => {
  if (request.body && typeof request.body === 'object') return request.body as Record<string, unknown>;

  const declared = Number(request.headers['content-length'] || 0);
  // A wrong Content-Length is refused before reading anything, but it is not trusted as the only
  // check: the stream is counted too, because the header is caller-supplied.
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BodyError('請求內容過大。', 413);
  }

  const chunks: Buffer[] = [];
  let received = 0;
  if (typeof request[Symbol.asyncIterator] === 'function') {
    for await (const chunk of request as AsyncIterable<unknown>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
      received += buffer.byteLength;
      if (received > maxBytes) throw new BodyError('請求內容過大。', 413);
      chunks.push(buffer);
    }
  }

  if (received === 0) return {};
  let raw = Buffer.concat(chunks).toString('utf8');
  // A leading BOM survives UTF-8 decoding and makes `JSON.parse` fail on an otherwise valid body.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (!raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BodyError('請求內容不是有效的 JSON。', 400);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
};
