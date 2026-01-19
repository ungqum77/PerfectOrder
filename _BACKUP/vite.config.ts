import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // Vercel이 Vite 프로젝트에서 기대하는 기본 출력 폴더명
  }
});