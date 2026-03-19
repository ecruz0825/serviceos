import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lawn Care App - Crew Portal',
        short_name: 'Crew Portal',
        description: 'Mobile-first crew portal for daily operations',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/crew/jobs',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Only cache app shell assets (JS, CSS, HTML, icons)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Increase max file size for precaching (default is 2 MiB, bundle is ~2.26 MB)
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
        // Explicitly exclude Supabase API endpoints from navigation fallback
        navigateFallbackDenylist: [
          /^https:\/\/.*\.supabase\.co\/.*/i,
          /\/rest\/v1\//i,
          /\/auth\/v1\//i,
          /\/storage\/v1\//i,
          /\/functions\/v1\//i
        ],
        runtimeCaching: [
          // Explicitly prevent caching of Supabase API calls
          // All Supabase endpoints use NetworkOnly (never cache)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly', // Never cache - always fetch from network
            options: {
              cacheName: 'supabase-api-excluded'
            }
          },
          // Also exclude any local paths that might proxy to Supabase
          {
            urlPattern: /\/rest\/v1\//i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /\/auth\/v1\//i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /\/storage\/v1\//i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /\/functions\/v1\//i,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
})
