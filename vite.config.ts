import { defineConfig } from 'vitest/config';

// Relative base so the build works on GitHub Pages project URLs.
// Scraped bike data lives in public/data and is served as static JSON.
export default defineConfig({
  base: './',
  // three.js alone is ~600 kB; the site is a single page so one chunk is fine.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
