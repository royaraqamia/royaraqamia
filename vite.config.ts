import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  publicDir: 'public',
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Optimized chunking for better caching and performance
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('@phosphor-icons/react')) {
              return 'ui';
            }
            if (id.includes('react-hook-form') || id.includes('@radix-ui/react-select') || id.includes('@radix-ui/react-dialog')) {
              return 'forms';
            }
          }
        },
      },
    },
    // Performance optimizations for Core Web Vitals
    minify: 'esbuild',
    cssMinify: true,
    chunkSizeWarningLimit: 500,
    reportCompressedSize: true,
  },
  // Optimize deps for faster HMR
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'framer-motion'],
  },
  // Preload for faster initial load
  preview: {
    port: 3005,
    open: true,
  },
  server: {
    port: 3005,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
