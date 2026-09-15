/**
 * Поведінка «хрому» сайту: перемикач теми, мобільне меню, тост, заглушка пошуку.
 * Без фреймворків; запускається один раз із BaseLayout.
 */
import { THEME_STORAGE_KEY } from '../../lib/site-nav';

const TOAST_MS = 3200;
const MENU_MAX_WIDTH = 1280;

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function labelFor(theme: Theme): string {
  return theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему';
}

function initTheme(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');
  const sync = () => buttons.forEach((button) => button.setAttribute('aria-label', labelFor(currentTheme())));
  sync();
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Сховище недоступне (приватний режим, заборона): тема живе до перезавантаження.
      }
      sync();
    }),
  );
}

export function showToast(html: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = html;
  toast.setAttribute('data-show', '');
  const previous = Number(toast.dataset['timer'] ?? 0);
  if (previous) clearTimeout(previous);
  toast.dataset['timer'] = String(setTimeout(() => toast.removeAttribute('data-show'), TOAST_MS));
}

function initToast(): void {
  document.addEventListener('ku:toast', (event) => {
    const detail = (event as CustomEvent<{ html?: string; text?: string }>).detail;
    if (detail?.html) showToast(detail.html);
    else if (detail?.text) {
      const span = document.createElement('span');
      span.textContent = detail.text;
      showToast(span.outerHTML);
    }
  });
}

function initSearchPlaceholder(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-search-placeholder]').forEach((button) =>
    button.addEventListener('click', () => showToast('Пошук по курсу з’явиться разом із першими темами')),
  );
}

function initMenu(): void {
  const dialog = document.getElementById('site-menu');
  const opener = document.querySelector<HTMLButtonElement>('[data-menu-open]');
  if (!(dialog instanceof HTMLDialogElement) || !opener) return;

  const setExpanded = (open: boolean) => opener.setAttribute('aria-expanded', String(open));
  const close = () => {
    if (dialog.open) dialog.close();
  };

  opener.addEventListener('click', () => {
    dialog.showModal();
    setExpanded(true);
    dialog.querySelector<HTMLElement>('.menu-nav a, .menu-nav .nav-soon')?.focus?.();
  });
  dialog.addEventListener('close', () => setExpanded(false));
  dialog.querySelectorAll<HTMLElement>('[data-menu-close], .menu-nav a, .seg a').forEach((el) => el.addEventListener('click', close));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  matchMedia(`(min-width: ${MENU_MAX_WIDTH + 1}px)`).addEventListener('change', (event) => {
    if (event.matches) close();
  });
}

export function initSiteChrome(): void {
  initTheme();
  initToast();
  initSearchPlaceholder();
  initMenu();
}
