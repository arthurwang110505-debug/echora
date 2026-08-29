import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';

export default defineConfig({
  define: {
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(gitCommitSha),
  },
  plugins: [
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
          'covers/*.{svg,png,jpg,webp}',
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/files\.manuscdn\.com\/.*\.(mp3|m4a|ogg|wav)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'demo-audio-cache',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 14
              }
            }
          },
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
      '@echora/core': resolve(__dirname, '../core/src/index.ts')
    }
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@react-three') || id.includes('/three/') || id.includes('/three@')) return 'three-runtime';
          // Sonnet's ~50 scene modules (~11k lines) plus Pixi (its only consumer) are
          // exclusive to the lazily loaded Sonnet mode; grouping them keeps megabytes
          // out of the shared stage chunk that every player entry parses. They share
          // one chunk because splitting them produced a circular chunk graph.
          if (id.includes('/original-folia-visualizers/sonnet/') || id.includes('pixi.js') || id.includes('/pixi.js/') || id.includes('@pixi/')) return 'sonnet-scene';
          if (id.includes('@paper-design') || id.includes('framer-motion')) return 'stage-runtime';
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
});
