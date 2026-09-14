const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const FILE_EXTENSION = /\.[a-z0-9]+$/i;

/**
 * Приєднує base до внутрішнього шляху. Сторінки отримують кінцеву скісну риску (trailingSlash: 'always'),
 * файли з розширенням — ні. Запит і якір зберігаються.
 */
export function joinBase(base: string, path = ''): string {
  if (EXTERNAL_URL.test(path)) {
    throw new Error(`url() приймає лише внутрішній шлях, отримано «${path}»`);
  }

  const trimmedBase = base.replace(/^\/+|\/+$/g, '');
  const normalizedBase = trimmedBase === '' ? '/' : `/${trimmedBase}/`;

  const suffixStart = path.search(/[?#]/);
  const rawPathname = suffixStart === -1 ? path : path.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : path.slice(suffixStart);

  const pathname = rawPathname.replace(/^\/+/, '');
  const needsSlash = pathname !== '' && !pathname.endsWith('/') && !FILE_EXTENSION.test(pathname);
  return `${normalizedBase}${pathname}${needsSlash ? '/' : ''}${suffix}`;
}

/** Внутрішнє посилання з урахуванням `base` з astro.config.mjs. Використовувати для всіх href і src. */
export function url(path = ''): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
