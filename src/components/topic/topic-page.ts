/**
 * Поведінка сторінки теми: зміст із підсвіткою поточного розділу, прогрес читання, поповери термінів.
 * Прогрес читання — лише в межах сторінки; збереження робить рушій прогресу через [data-reading-progress].
 */
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 16;

function buildToc(article: HTMLElement, toc: HTMLElement): HTMLAnchorElement[] {
  const headings = Array.from(article.querySelectorAll<HTMLHeadingElement>('h2[id]'));
  if (headings.length === 0) return Array.from(toc.querySelectorAll('a'));
  const links = headings.map((heading) => {
    const link = document.createElement('a');
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent?.trim() ?? '';
    return link;
  });
  toc.replaceChildren(...links);
  return links;
}

function initToc(article: HTMLElement): void {
  const toc = document.querySelector<HTMLElement>('[data-toc]');
  if (!toc) return;
  const links = buildToc(article, toc);
  const headings = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((el): el is HTMLElement => el !== null);
  if (headings.length === 0 || !('IntersectionObserver' in window)) return;

  const setCurrent = (id: string) =>
    links.forEach((link) => {
      const isCurrent = decodeURIComponent(link.hash.slice(1)) === id;
      if (isCurrent) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });

  const visible = new Set<string>();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id)));
      const first = headings.find((heading) => visible.has(heading.id));
      if (first) setCurrent(first.id);
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
  );
  headings.forEach((heading) => observer.observe(heading));
  setCurrent(headings[0]?.id ?? '');
}

function initReadingProgress(article: HTMLElement): void {
  const meter = document.querySelector<HTMLElement>('[data-reading-progress]');
  const bar = document.querySelector<HTMLElement>('.reading-progress > i');
  const fill = meter?.querySelector<HTMLElement>('i');
  const label = document.querySelector<HTMLElement>('[data-reading-progress-label]');
  let max = 0;

  const update = () => {
    const rect = article.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const done = total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total));
    max = Math.max(max, done);
    const percent = Math.round(max * 100);
    if (bar) bar.style.width = `${percent}%`;
    if (fill) fill.style.width = `${percent}%`;
    if (meter) meter.setAttribute('aria-valuenow', String(percent));
    if (meter) meter.dataset['value'] = String(percent);
    if (label) label.textContent = `${percent} %`;
  };
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', update);
  update();
}

function initTermPopovers(): void {
  document.querySelectorAll<HTMLButtonElement>('.term[popovertarget]').forEach((button) => {
    const pop = document.getElementById(button.getAttribute('popovertarget') ?? '');
    if (!pop) return;
    button.addEventListener('click', () => {
      requestAnimationFrame(() => {
        const rect = button.getBoundingClientRect();
        const width = pop.offsetWidth;
        const height = pop.offsetHeight;
        const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), window.innerWidth - width - VIEWPORT_MARGIN);
        const below = rect.bottom + POPOVER_GAP;
        const top = below + height > window.innerHeight ? rect.top - height - POPOVER_GAP : below;
        pop.style.left = `${left}px`;
        pop.style.top = `${Math.max(POPOVER_GAP, top)}px`;
      });
    });
    pop.addEventListener('toggle', (event) => {
      const open = (event as ToggleEvent).newState === 'open';
      document.querySelectorAll<HTMLButtonElement>(`.term[popovertarget="${pop.id}"]`).forEach((b) => b.setAttribute('aria-expanded', String(open)));
    });
  });
}

/** Друк: розкриває всі <details> (розбір кейсу, текстовий опис схеми) і повертає стан після друку. */
function initPrintDetails(): void {
  const opened = new Set<HTMLDetailsElement>();
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll<HTMLDetailsElement>('details:not([open])').forEach((details) => {
      details.open = true;
      opened.add(details);
    });
  });
  window.addEventListener('afterprint', () => {
    opened.forEach((details) => {
      details.open = false;
    });
    opened.clear();
  });
}

export function initTopicPage(): void {
  initPrintDetails();
  const article = document.querySelector<HTMLElement>('[data-topic-article]');
  if (article) {
    initToc(article);
    initReadingProgress(article);
  }
  initTermPopovers();
}
