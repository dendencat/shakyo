import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri CLI経由のビルド時のみ環境変数が設定される(Webビルドは従来どおり)
const tauriPlatform = process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
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
