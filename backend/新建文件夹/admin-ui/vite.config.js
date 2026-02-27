import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
    plugins: [vue()],
    base: '/admin/',
    resolve: {
        alias: {
            '@': path.resolve(process.cwd(), 'src')
        }
    },
    server: {
        proxy: {
            '/admin/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true
    }
})
