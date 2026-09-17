import { pathToFileURL } from 'node:url';

/**
 * Адреса живого сайту разом із base — з `astro.config.mjs`, щоб вона була задана в одному місці.
 * Експортери підставляють її в посилання Книги і в модулі «Посилання» курсу Moodle.
 */

interface AstroConfigShape {
  readonly site?: string;
  readonly base?: string;
}

export function joinSiteUrl(site: string, base: string | undefined): string {
  const origin = site.replace(/\/+$/, '');
  const path = (base ?? '').replace(/^\/+|\/+$/g, '');
  return path === '' ? `${origin}/` : `${origin}/${path}/`;
}

export async function readSiteUrl(configPath: string): Promise<string> {
  const module = (await import(pathToFileURL(configPath).href)) as { default?: AstroConfigShape };
  const config = module.default;
  if (config?.site === undefined) throw new Error(`У ${configPath} не задано site: адресу сайту нема звідки взяти`);
  return joinSiteUrl(config.site, config.base);
}
