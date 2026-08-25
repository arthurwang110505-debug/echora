import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiResponse = ServerResponse & {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => void;
};

type ApiRequest = IncomingMessage & { method?: string };

const sendJson = (response: ApiResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: '只支援 GET。' });
    return;
  }

  sendJson(response, 200, {
    provider: 'agnes',
    configured: Boolean(process.env.AGNES_API_KEY),
  });
}
