import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build', // 기존 CRA 배포 설정과의 호환성을 위해 build 폴더 사용
  }
});