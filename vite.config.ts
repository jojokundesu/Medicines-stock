import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Dukaan — Pharmacy Cashier Trainer',
        short_name: 'Dukaan',
        description:
          'A 3D first-person pharmacy cashier simulator that trains fast, accurate retail transactions with real medicine MRPs.',
        theme_color: '#0f766e',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1']
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1']
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600
  }
});
