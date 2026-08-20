import type {
  AiProviderConfig,
  AiThemeRequest,
  AiThemeResponse,
} from './types';

// Gemini prompt for theme generation
const GEMINI_PROMPT = `You are a color theme designer for a music lyrics player. Based on the lyrics or song title, generate a beautiful color theme.

Lyrics: {{lyrics}}
Song Title: {{title}}
Is Pure Music: {{isPureMusic}}

Return a JSON object with this exact structure (no markdown, no code blocks):
{
  "light": {
    "name": "Theme Name",
    "backgroundColor": "#hex",
    "primaryColor": "#hex",
    "accentColor": "#hex",
    "secondaryColor": "#hex",
    "wordColors": [{"word": "keyword", "color": "#hex"}],
    "lyricsIcons": ["Heart", "Cloud"],
    "fontStyle": "sans",
    "provider": "Google Gemini"
  },
  "dark": {
    "name": "Theme Name",
    "backgroundColor": "#hex",
    "primaryColor": "#hex",
    "accentColor": "#hex",
    "secondaryColor": "#hex",
    "wordColors": [{"word": "keyword", "color": "#hex"}],
    "lyricsIcons": ["Heart", "Cloud"],
    "fontStyle": "sans",
    "provider": "Google Gemini"
  }
}

Guidelines:
- Light theme should have light background with dark text
- Dark theme should have dark background with light text
- Accent color should be complementary and visually appealing
- Include relevant keywords and their colors
- Use appropriate Lucide icon names for lyricsIcons`;

// OpenAI prompt (same structure)
const OPENAI_PROMPT = GEMINI_PROMPT;

// Generate theme using Gemini
export async function generateThemeGemini(
  config: AiProviderConfig,
  request: AiThemeRequest
): Promise<AiThemeResponse> {
  const prompt = GEMINI_PROMPT
    .replace('{{lyrics}}', request.lyricsText.slice(0, 500))
    .replace('{{title}}', request.songTitle || '')
    .replace('{{isPureMusic}}', String(request.isPureMusic));

  const response = await fetch(`${config.apiUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/gemini-2.0-flash:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: config.temperature ?? 0.7,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseThemeResponse(text);
}

// Generate theme using OpenAI compatible API
export async function generateThemeOpenAI(
  config: AiProviderConfig,
  request: AiThemeRequest
): Promise<AiThemeResponse> {
  const prompt = OPENAI_PROMPT
    .replace('{{lyrics}}', request.lyricsText.slice(0, 500))
    .replace('{{title}}', request.songTitle || '')
    .replace('{{isPureMusic}}', String(request.isPureMusic));

  const response = await fetch(`${config.apiUrl || 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const text = data?.choices?.[0]?.message?.content || '';

  return parseThemeResponse(text);
}

// Parse theme response (handle potential markdown code blocks)
function parseThemeResponse(text: string): AiThemeResponse {
  // Remove markdown code blocks if present
  const cleaned = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback to cover-based theme generation
    return generateFallbackTheme();
  }
}

// Fallback theme generation (cover-based)
function generateFallbackTheme(): AiThemeResponse {
  return {
    light: {
      name: 'Default Light',
      backgroundColor: '#f6f3ef',
      primaryColor: '#231f20',
      accentColor: '#c96e4f',
      secondaryColor: '#5c4d48',
      fontStyle: 'sans',
      provider: 'Fallback',
    },
    dark: {
      name: 'Default Dark',
      backgroundColor: '#101217',
      primaryColor: '#f6f3ef',
      accentColor: '#d88d6e',
      secondaryColor: '#b9aea7',
      fontStyle: 'sans',
      provider: 'Fallback',
    },
  };
}

// Main generate function
export async function generateTheme(
  config: AiProviderConfig,
  request: AiThemeRequest
): Promise<AiThemeResponse> {
  if (!config.apiKey) {
    throw new Error('API key is required');
  }

  try {
    if (config.provider === 'gemini') {
      return await generateThemeGemini(config, request);
    } else {
      return await generateThemeOpenAI(config, request);
    }
  } catch (error) {
    console.error('Theme generation failed:', error);
    return generateFallbackTheme();
  }
}
