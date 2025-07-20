import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Include both index.html and usage.html in the build so the help page
// works when deployed.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        usage: resolve(__dirname, 'usage.html'),
      },
    },
  },
});
