import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDemo = mode === 'demo' || mode === 'demo-local' || env.VITE_DEMO_MODE === 'true'
  const demoBase = mode === 'demo-local' ? '/' : '/SpotiQueue/'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@demo': path.resolve(__dirname, '../demo'),
      },
    },
    base: isDemo ? demoBase : '/',
    build: {
      outDir: 'build',
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
