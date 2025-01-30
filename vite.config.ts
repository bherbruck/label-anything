import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, PluginOption } from 'vite'

const wasmContentType = () =>
  ({
    name: 'wasm-content-type-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req?.url?.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm')
        }
        next()
      })
    },
  }) as PluginOption

export default defineConfig({
  plugins: [react(), tailwindcss(), wasmContentType()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  base: process.env.GITHUB_PAGES ? '/label-anything/' : '/',
})
