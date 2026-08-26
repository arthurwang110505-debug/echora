import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
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
        start_url: '/',
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
          'echora-icon.svg',
          'echora-icon-192.png',
          'echora-icon-512.png',
          'echora-icon-maskable.png',
          'assets/index-*.{js,css}',
          'assets/Home-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.echora\.example\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24
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
          if (id.includes('pixi.js') || id.includes('@paper-design') || id.includes('framer-motion')) return 'stage-runtime';
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
