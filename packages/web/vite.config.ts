import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { siteMetadataPlugin, type SiteMetadataEnv } from './vite-plugins/siteMetadata';
import { devApiFunctionsPlugin } from './vite-plugins/devApiFunctions';
import { precacheShellClosure } from './vite-plugins/precacheShellClosure';

const gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';

export default defineConfig(({ mode }) => {
  // `loadEnv` also picks up `packages/web/.env*`, which plain `process.env` does
  // not; Search Console verification is configured through these variables.
  const env = { ...process.env, ...loadEnv(mode, __dirname, '') } as SiteMetadataEnv;

  return {
    define: {
      'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(gitCommitSha),
    },
    plugins: [
      siteMetadataPlugin(env),
      // `vite dev` has no serverless functions; this mounts them so the AI features and the
      // YouTube search proxy can be exercised (and a prompt iterated on) before deploying.
      // Never part of the production build.
      devApiFunctionsPlugin(resolve(__dirname, '../..')),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['echora-icon.svg', 'echora-icon-192.png', 'echora-icon-512.png', 'echora-icon-maskable.png'],
        manifest: {
          name: 'Echora — 沉浸式歌詞舞台',
          short_name: 'Echora',
          description: '在手機、iPad 與電腦上使用的沉浸式歌詞與音樂舞台。',
          theme_color: '#07090e',
          background_color: '#07090e',
          display: 'standalone',
          orientation: 'any',
          lang: 'zh-TW',
          scope: '/',
          // Installed users must land directly in the app shell / playlist picker.
          // The landing page at / stays the public website entry for new visitors.
          start_url: '/app',
          // A stable install identity. Without it Chrome derives the id from `start_url`, so
          // changing the entry point later would register as a different app and orphan the
          // existing installs.
          id: '/app',
          categories: ['music', 'entertainment'],
          // Long-press shortcuts on the installed icon. Both are real routes that work without
          // an account: the stage falls back to the local showcase, the library explains what to
          // connect.
          shortcuts: [
            {
              name: '開啟歌詞舞台',
              short_name: '舞台',
              description: '直接進入沉浸式歌詞舞台',
              url: '/player?demo=1',
              icons: [{ src: 'echora-icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: '我的音樂庫',
              short_name: '音樂庫',
              description: '查看已連接的音樂與歌單',
              url: '/library',
              icons: [{ src: 'echora-icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
          icons: [
            {
              src: 'echora-icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'echora-icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'echora-icon-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          // Do not precache the HTML shell. A stale precached index.html can reference
          // deleted hashed chunks after a Vercel release and leave the app blank.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Keep the install path small. Stage-only visualizer chunks and image packs
          // stay network-loaded until the user enters the player, so a homepage refresh
          // does not download the whole application before first paint.
          // The globs below name the shell's *entry* chunks. They are not the whole shell: since
          // the manualChunks split, `index` imports `react-vendor` and `vite-helper`, and the two
          // landing routes import a dozen more chunks. `manifestTransforms` adds whatever those
          // entries statically reach - see vite-plugins/precacheShellClosure.ts for the white
          // screen this fixed.
          manifestTransforms: [precacheShellClosure({ distDir: resolve(__dirname, 'dist') })],
          globPatterns: [
            'registerSW.js',
            'favicon.png',
            'echora-icon.svg',
            'echora-icon-180.png',
            'echora-icon-192.png',
            'echora-icon-512.png',
            'echora-icon-maskable.png',
            'assets/index-*.{js,css}',
            'assets/AppHome-*.js',
            'assets/Welcome-*.js',
            // Only the 1024 px variants: they are what every thumbnail, mini player and visualizer
            // samples, and precaching the 1920 px originals too would add 3.3 MB to an install
            // whose whole point is working offline. The stage's full-resolution art is fetched on
            // demand and kept by the `demo-cover-cache` runtime route below.
            'covers/*-1024.webp',
          ],
          // NOTE: demo audio is deliberately absent from runtimeCaching: see the comment
          // above the first entry for why a service-worker audio cache breaks this player.
          runtimeCaching: [
            {
              urlPattern: /\/covers\/.*\.(png|jpg|jpeg|svg|webp)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'demo-cover-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
            {
              urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|webp)/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 7
                }
              }
            }
          ]
        }
      })
    ],
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    resolve: {
      alias: {
        '@echora/core': resolve(__dirname, '../core/src/index.ts'),
        // The segmentation prompt/parser the serverless endpoint also imports. One module, so the
        // "run it for me" and "give me the prompt" paths cannot ask for different things.
        '@shared': resolve(__dirname, '../../shared')
      }
    },
    build: {
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // Order is the contract, and it is load-bearing.
          //
          // `manualChunks` is asked about one module at a time, but Rollup then puts any
          // module reachable from *every* chunk into the first manual chunk it created.
          // Two rules made that expensive:
          //
          //   * Vite's `vite/preload-helper` is imported by every chunk that lazy-loads.
          //     It used to land in `sonnet-scene`, so `index.html` preloaded that whole
          //     chunk - 2,336 kB of Pixi, Sonnet scenes, every background and every lucide
          //     icon - on the landing page, for `__vitePreload` plus a few icons.
          //   * `id.includes('/three/')` also matches pnpm's `..._three@0.185.1/...`
          //     paths, so React's scheduler, zustand and use-sync-external-store were
          //     captured into `three-runtime`; the shell needs zustand and therefore
          //     preloaded 876 kB of three.js.
          //
          // Measured before: the shell fetched 3,710 kB (990 kB gzip) before its first
          // pixel. After: 583 kB (186 kB gzip). `scripts/check-shell-closure.mjs` holds
          // that line in CI.
          manualChunks(id) {
            // 0) Shared by every chunk that lazy-loads: it must never share a chunk with a
            //    vendor family, or that family becomes a startup download.
            if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'vite-helper';
            // 1) The framework runtime first: every vendor below depends on it, and a
            //    vendor chunk that captures part of it drags that vendor into the shell.
            if (/\/node_modules\/(\.pnpm\/)?(react@|react-dom@|scheduler@|react-router|zustand@|use-sync-external-store|@remix-run)/.test(id)) return 'react-vendor';
            // 2) Leaf vendor families, matched on anchored package paths only - the
            //    `includes('/three/')` above is what misfiled everything else.
            if (id.includes('@react-three') || /\/node_modules\/(\.pnpm\/)?three@/.test(id)) return 'three-runtime';
            if (id.includes('@paper-design') || id.includes('framer-motion')) return 'stage-runtime';
            if (/\/node_modules\/(\.pnpm\/)?(@pixi|pixi\.js@)/.test(id)) return 'pixi-runtime';
            // 3) Deliberately no `sonnet/` rule. Sonnet's scene modules are reachable only
            //    from the lazily loaded mode, so letting them fall through splits them
            //    naturally - and because they statically import Pixi they land in
            //    `pixi-runtime`, not in a chunk the shell preloads. Grouping them by
            //    directory was measured to put 1.33 MB back on the preload list.
            return undefined;
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // The Arena preview proxies the sandbox through *.e2b.app; allow those hosts.
      allowedHosts: true,
    }
  };
});
