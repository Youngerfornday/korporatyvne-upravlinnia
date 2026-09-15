// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { typographyPlugin } from './src/lib/typography/satteri-plugin.ts';

// Живий сайт: https://youngerfornday.github.io/korporatyvne-upravlinnia/
// Усі внутрішні посилання будуються через src/lib/url.ts з урахуванням base.
export default defineConfig({
  output: 'static',
  site: 'https://youngerfornday.github.io',
  base: '/korporatyvne-upravlinnia',
  trailingSlash: 'always',
  markdown: {
    // Astro 7 рендерить Markdown і MDX через Sätteri; українську типографіку робить наш hast-плагін,
    // тому англійський SmartyPants вимкнено (він ставив би “” замість «»).
    processor: satteri({ hastPlugins: [typographyPlugin], features: { smartPunctuation: false } }),
  },
  integrations: [mdx({ smartypants: false }), react(), sitemap()],
});
