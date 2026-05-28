import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/GameMakerJS/', // <-- TUTAJ WPISZ TĘ LINIJKĘ
  plugins: [
    VitePWA({
      strategies: 'generateSW', // Wymuszamy generowanie Service Workera
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'], 
      
      manifest: {
        name: 'GameMaker JS',
        short_name: 'GameMakerJS',
        description: 'Visual game editor – Phaser + node scripting',
        theme_color: '#1a1a2e',
        background_color: '#0f0f23',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './index.html', // Zmieniamy na bezpośredni plik html dla pewności offline
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Dodajemy './index.html' do listy, żeby na pewno wskoczył do pamięci podręcznej
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}', './index.html'], 
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { 
              cacheName: 'google-fonts-cache', 
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } 
            }
          }
        ]
      }
    })
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }))
  },
  server: { port: 3000, host: true },
  preview: { port: 3000, host: true }
})