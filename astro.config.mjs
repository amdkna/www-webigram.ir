import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://webigram.ir',
  output: 'static',
  trailingSlash: 'always',
  // The dev toolbar floats over the page in `npm run dev`; it never ships to production.
  devToolbar: { enabled: false },
});
