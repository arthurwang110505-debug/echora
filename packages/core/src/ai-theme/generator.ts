import type { AiProviderConfig, AiThemeRequest, AiThemeResponse } from './types';

/**
 * AI theme generation is intentionally server-side now. The web client uses
 * `/api/ai/theme`, which keeps the Agnes credential outside the Vite bundle.
 * This compatibility export fails loudly for callers that still use the old
 * core direct-provider API instead of silently returning a fallback theme.
 */
export async function generateTheme(
  _config: AiProviderConfig,
  _request: AiThemeRequest,
): Promise<AiThemeResponse> {
  throw new Error('AI 主題生成已移至 Agnes AI server-side proxy，請改用產品的 Agnes endpoint。');
}
