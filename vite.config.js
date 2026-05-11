import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Wolfsburg-Investigating-Tool/',
  server: {
    proxy: {
      '/strava-heatmap-a': {
        target: 'https://heatmap-external-a.strava.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/strava-heatmap-a/, ''),
      },
      '/strava-heatmap-b': {
        target: 'https://heatmap-external-b.strava.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/strava-heatmap-b/, ''),
      },
      '/strava-heatmap-c': {
        target: 'https://heatmap-external-c.strava.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/strava-heatmap-c/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          react: ['react', 'react-dom'],
          charts: ['recharts'],
          districts: ['./src/data/districtBoundaries.json'],
        },
      },
    },
  },
})
