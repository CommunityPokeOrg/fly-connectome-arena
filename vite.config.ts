import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/fly-connectome-arena/' : '/',
  build: { outDir: 'dist', target: 'es2022' },
});
