/** Дрібні DOM-помічники гідрації: іконки зі спрайта, знак стану теми, безпечний текст. */
import { TOPIC_STATE_LABELS, type TopicVisualState } from './derive';

export function iconSvg(name: string, className = 'icon'): string {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

const MARK_ICON: Readonly<Record<TopicVisualState, string | null>> = { done: 'check', doing: 'play', todo: null };

/** Знак стану теми: клас, іконка й підпис для скрінрідера — стан не лише кольором. */
export function renderMark(mark: HTMLElement, state: TopicVisualState): void {
  mark.classList.remove('mark-todo', 'mark-doing', 'mark-done');
  mark.classList.add(`mark-${state}`);
  mark.setAttribute('aria-label', TOPIC_STATE_LABELS[state]);
  const icon = MARK_ICON[state];
  mark.innerHTML = icon ? iconSvg(icon) : '';
}

export function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

export function query<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function queryAll<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
