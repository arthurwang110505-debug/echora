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
      includeAssets: ['echora-icon.svg'],
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
            src: 'echora-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'echora-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'echora-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          }
        ]
      },
      workbox: {
        // The original Folia visualizer bundle is intentionally large; let Workbox
        // generate the service worker while keeping that bundle network-loaded.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wav,mp3}'],
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
  server: {
    port: 3000
  }
});
