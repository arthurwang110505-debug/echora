// api/_lib/http.ts
//
// The response helper the routes share, plus the "the caller is done" guard pattern.
//
// Every route had its own `sendJson`, which is harmless, and its own `if (!request.method === ...)`
// then `return`, which is not: a route that forgets one `return` keeps executing with the response
// already ended. `respond` closes the response and returns `false`, so a route reads
//
//   if (!respond(response, 405, ...)) return;
//
// and there is exactly one place that knows how a response ends.

export type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string | number | readonly string[]) => unknown;
  end: (body?: string) => unknown;
};

/** Ends the response. Returns false so callers can `if (!respond(...)) return;`. */
export const respond = (response: ApiResponse, status: number, payload: unknown): false => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
  return false;
};

/** Ends the response with a raw body and its own content type (the TTML route). */
export const respondRaw = (
  response: ApiResponse,
  status: number,
  contentType: string,
  body: string,
  headers: Record<string, string> = {},
): false => {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
  return false;
};

export const methodNotAllowed = (response: ApiResponse, allowed: string): false => {
  response.setHeader('Allow', allowed);
  return respond(response, 405, { error: `只支援 ${allowed}。` });
};
