// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Живий сайт: https://youngerfornday.github.io/korporatyvne-upravlinnia/
// Усі внутрішні посилання будуються через src/lib/url.ts з урахуванням base.
export default defineConfig({
  output: 'static',
  site: 'https://youngerfornday.github.io',
  base: '/korporatyvne-upravlinnia',
  trailingSlash: 'always',
  integrations: [mdx(), react(), sitemap()],
});
