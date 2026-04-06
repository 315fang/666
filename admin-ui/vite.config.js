import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  base: '/admin/',
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()]
    }),
    Components({
      resolvers: [ElementPlusResolver()]
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/admin/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/vue-router/') || id.includes('/node_modules/pinia/')) {
            return 'vue-vendor'
          }

          if (id.includes('/node_modules/@element-plus/icons-vue/')) {
            return 'element-plus-icons'
          }

          if (id.includes('/node_modules/echarts/')) {
            return 'echarts-vendor'
          }

          if (id.includes('/node_modules/axios/')) {
            return 'http-vendor'
          }
        }
      }
    }
  }
})
