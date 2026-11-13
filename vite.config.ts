/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg', 'mark.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tierra Viewings',
        short_name: 'Viewings',
        description: 'Driver and viewing scheduler for Tierra Properties',
        theme_color: '#F7F3EE',
        background_color: '#F7F3EE',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], importScripts: ['push-sw.js'] },
    }),
  ],
  build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'] } } } },
  test: { environment: 'node', testTimeout: 30_000, hookTimeout: 60_000, include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts'] },
})
