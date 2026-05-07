import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Wolfsburg-Investigating-Tool/',
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
