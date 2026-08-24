import { defineConfig } from 'vite';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  root: 'web',
  base: process.env.BASE_PATH ?? (repositoryName ? `/${repositoryName}/` : '/'),
  publicDir: 'public',
  assetsInclude: ['**/*.pdf', '**/*.ttf'],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: new URL('./web/index.html', import.meta.url).pathname,
        licenses: new URL('./web/licenses.html', import.meta.url).pathname,
      },
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
