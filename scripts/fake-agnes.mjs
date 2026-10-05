#!/usr/bin/env node
/**
 * A stand-in for the AGNES endpoint, for driving the AI features locally without a key.
 *
 *   node scripts/fake-agnes.mjs &
 *   AGNES_API_KEY=test AGNES_BASE_URL=http://127.0.0.1:32155/v1 pnpm dev
 *
 * Why it exists: the prompts are the part of these features that needs iterating, and the only
 * other way to see them run is to deploy. It also makes the request itself inspectable — every call
 * is logged, so "did the rules actually go out?" is answered by looking (see docs/lyric-segmentation).
 *
 * It answers in the real shape (an OpenAI-compatible chat completion carrying JSON) but the
 * segmentation itself is Intl.Segmenter, not a model. That is deliberately good enough to exercise
 * the whole path and deliberately not good enough to mistake for the real thing.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_AGNES_PORT || 32155);

/** The segmentation answer, produced with the same segmenter the app falls back to. */
const segmentLines = (lines) => lines.map(text => {
    const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text));
    const boundaries = segments.map(segment => segment.segment);
    return boundaries.length > 0 ? boundaries : [text];
});

/** The theme answer, minimal but shaped like the real response. */
const themeFor = (prompt) => ({
    light: { name: 'Fake Light', backgroundColor: '#f6f3ef', primaryColor: '#231f20', accentColor: '#c96e4f', secondaryColor: '#5c4d48', fontStyle: 'sans' },
    dark: { name: 'Fake Dark', backgroundColor: '#101217', primaryColor: '#f6f3ef', accentColor: '#d88d6e', secondaryColor: '#b9aea7', fontStyle: 'sans' },
    ...(prompt ? {} : {}),
});

const server = createServer((request, response) => {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
        let body = {};
        try {
            body = JSON.parse(raw || '{}');
        } catch {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: { message: 'invalid JSON' } }));
            return;
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        const system = messages.find(message => message.role === 'system')?.content ?? '';
        const user = messages.find(message => message.role === 'user')?.content ?? '';
        console.log(`[fake-agnes] ${request.url} model=${body.model} temperature=${body.temperature} chars=${raw.length}`);
        console.log(`[fake-agnes]   system: ${system.slice(0, 80).replace(/\n/g, ' ')}…`);

        let content;
        if (system.includes('segment song lyrics') || user.includes('lyric lines')) {
            // The lyric lines arrive numbered ("1. 把回忆拼好给你"); the numbering is not the lyric.
            const lines = user.split('\n')
                .filter(line => /^\d+\.\s/.test(line))
                .map(line => line.replace(/^\d+\.\s/, ''));
            content = JSON.stringify({ lines: segmentLines(lines) });
        } else {
            content = JSON.stringify(themeFor(user));
        }

        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ choices: [{ message: { content } }], usage: {} }));
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[fake-agnes] listening on http://127.0.0.1:${PORT}/v1`);
    console.log(`[fake-agnes] start the app with: AGNES_API_KEY=test AGNES_BASE_URL=http://127.0.0.1:${PORT}/v1 pnpm dev`);
});
