// @ts-check
import base from '../../astro.config.mjs';

/**
 * Збірка для E2E: та сама конфігурація сайту, але в окремий каталог dist-e2e/, щоб фікстурний банк
 * тестів (KU_E2E_BANK=1, див. src/components/quiz/load-bank.ts) ніколи не потрапляв у dist/ і деплой.
 */
export default { ...base, outDir: './dist-e2e' };
