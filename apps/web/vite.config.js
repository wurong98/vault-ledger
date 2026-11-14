import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const target = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@ledgerbox/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        proxy: {
            '/api': { target, changeOrigin: false },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
//# sourceMappingURL=vite.config.js.map