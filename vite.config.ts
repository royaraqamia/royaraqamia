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
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react', '@phosphor-icons/react'],
          forms: ['react-hook-form', '@radix-ui/react-select', '@radix-ui/react-dialog'],
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
