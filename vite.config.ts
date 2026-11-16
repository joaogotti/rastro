import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { validatePublicEnvironment } from './src/utils/environment.ts'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') validatePublicEnvironment(loadEnv(mode, process.cwd(), 'VITE_'))
  return { plugins: [react(), tailwindcss()] }
})
