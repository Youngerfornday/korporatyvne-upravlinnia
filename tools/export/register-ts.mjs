/**
 * Хук розв’язання модулів для запуску експортерів через `node` без збірки (Node ≥ 22.18 стирає типи сам).
 * Модулі в src/ імпортують сусідні файли без розширення (`./primitives`, `./grading`), як прийнято
 * в Astro/Vite; Node такі шляхи не знаходить, тож для відносних імпортів із .ts-файлів хук пробує
 * спершу `<шлях>.ts`, потім `<шлях>/index.ts`.
 * Запуск: node --import ./tools/export/register-ts.mjs tools/export/cli.ts
 */
import { registerHooks } from 'node:module';

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromTypeScript = context.parentURL?.endsWith('.ts') ?? false;
    if (!fromTypeScript || !RELATIVE.test(specifier) || HAS_EXTENSION.test(specifier)) {
      return nextResolve(specifier, context);
    }
    try {
      return nextResolve(`${specifier}.ts`, context);
    } catch {
      return nextResolve(`${specifier}/index.ts`, context);
    }
  },
});
