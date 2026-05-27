import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

function getBuildMeta() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  let hash = 'dev'
  try { hash = execSync('git rev-parse --short HEAD').toString().trim() } catch {}
  return `${date} ${time} · ${hash}`
}

export default defineConfig({
  base: '/GameMakerJS/', 
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
        // Zwiększamy limit cache z 2MB do 6MB, aby zmieścić wbudowany kompilator TypeScript (ok. 4.87 MB)
        maximumFileSizeToCacheInBytes: 6291456,

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
    __BUILD_META__: JSON.stringify(getBuildMeta())
  },
  server: { port: 3000, host: true },
  preview: { port: 3000, host: true }
})