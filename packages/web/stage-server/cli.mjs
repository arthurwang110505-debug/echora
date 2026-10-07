#!/usr/bin/env node
// packages/web/stage-server/cli.mjs
//
// Starts the Stage API relay.
//
//   pnpm stage:server                      # 127.0.0.1:32107, fresh token, any origin
//   pnpm stage:server -- --port 32107      # extra args go to this script after `--`
//   pnpm stage:server -- --token <token>   # reuse a token you already put in settings
//   pnpm stage:server -- --origin https://your-echora.example
//   pnpm stage:server -- --host 0.0.0.0    # reachable from other machines: read the warning first
//
// Prints the overlay URL and the token. The token is what the PWA needs in Settings, and what
// external tools send as `Authorization: Bearer <token>`.

import { STAGE_DEFAULT_HOST, STAGE_DEFAULT_PORT, STAGE_PROTOCOL_VERSION, generateStageToken } from './protocol.mjs';
import { startStageRelay } from './relay.mjs';

const argv = process.argv.slice(2);
const readFlag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};

const port = Number(readFlag('port', String(STAGE_DEFAULT_PORT)));
const host = readFlag('host', STAGE_DEFAULT_HOST);
const origin = readFlag('origin', '*');
const token = readFlag('token', '') || generateStageToken();

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`Invalid --port: ${readFlag('port', '')}`);
    process.exit(1);
}

const address = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
const overlayUrl = `http://${address}:${port}/obs?relay=${encodeURIComponent(`${address}:${port}`)}&token=${token}`;

const { server, relay } = await startStageRelay({ port, host, token, corsOrigin: origin });

console.log('');
console.log('  Echora Stage API relay');
console.log('  ─────────────────────────────────────────────────────────────');
console.log(`  protocol    v${STAGE_PROTOCOL_VERSION}`);
console.log(`  listening   http://${host}:${port}   ${host === STAGE_DEFAULT_HOST ? '(loopback only)' : ''}`);
console.log(`  token       ${token}`);
console.log(`  origin      ${origin === '*' ? 'any (loopback + token still required)' : origin}`);
console.log('');
console.log('  OBS browser source:');
console.log(`    ${overlayUrl}`);
console.log('');
console.log('  Echora settings → Stage → OBS 需要填：');
console.log(`    relay 地址  ${address}:${port}`);
console.log(`    token       ${token}`);
console.log('');
console.log('  Stage API:');
console.log(`    GET  /stage/health                     (no token)`);
console.log(`    GET  /stage/status`);
console.log(`    POST /stage/lyrics    { lyricsText, overrides? }`);
console.log(`    POST /stage/session   { title, artist, album?, coverUrl?, duration? }`);
console.log(`    POST /stage/clock     { positionSec, playing?, durationSec? }`);
console.log(`    POST /stage/publish   { kind: 'config' | 'clock', ... }   (the PWA itself)`);
console.log(`    GET  /obs/events      SSE for the overlay`);
console.log('');

if (host !== STAGE_DEFAULT_HOST) {
    console.log('  ⚠  Bound to a non-loopback address: anything that can reach this port can drive');
    console.log('     your overlay, and the token is the only thing in the way. Use it on a trusted');
    console.log('     network only, and prefer the default.');
    console.log('');
}

const shutdown = () => {
    console.log('\n  Stopping relay…');
    relay.close();
    server.close(() => process.exit(0));
    // A hung SSE client must not keep the process alive forever.
    setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
