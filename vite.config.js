import { defineConfig } from 'vite';

// base './' para que el build funcione en la raíz de Netlify y también bajo un subpath (GitHub Pages).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // three.js en su propio chunk: cambia poco, así el navegador lo cachea entre versiones del juego
        manualChunks: { three: ['three'] },
      },
    },
  },
});
