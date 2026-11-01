import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri CLI経由のビルド時のみ環境変数が設定される(Webビルドは従来どおり)
const tauriPlatform = process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Keep WASM helpers in the worker: split chunks importing the entry can reset its message handler in WebKit.
  worker: { format: 'es', rolldownOptions: { output: { codeSplitting: false } } },
  preview: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; frame-src https: http:; object-src 'none'; base-uri 'self'; form-action 'self'",
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: tauriPlatform ? (tauriPlatform === 'windows' ? 'chrome105' : 'safari13') : undefined,
  },
})
