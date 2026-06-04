import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 8082, strictPort: true, hmr: { clientPort: 443 } },
});