import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('recharts')) {
            return 'charts-vendor';
          }

          if (id.includes('@mui/x-data-grid')) {
            return 'mui-data-grid-vendor';
          }

          if (id.includes('@mui/icons-material')) {
            return 'mui-icons-vendor';
          }

          if (id.includes('@mui/material')) {
            return 'mui-material-vendor';
          }

          if (id.includes('@emotion')) {
            return 'emotion-vendor';
          }

          if (id.includes('react-router-dom')) {
            return 'router-vendor';
          }

          if (id.includes('react')) {
            return 'react-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true, // Automatically open browser
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    port: 3000,
  }
});