/** Поведінка самоперевірки: один вибір на питання, розбір усіх варіантів, подія для рушія прогресу. */
export interface SelfCheckDetail {
  readonly topic: string | undefined;
  readonly question: number;
  readonly correct: boolean;
  readonly answered: number;
  readonly total: number;
}

function answer(section: HTMLElement, questionEl: HTMLElement, chosen: HTMLButtonElement): void {
  const group = chosen.closest<HTMLElement>('.options');
  if (!group || group.hasAttribute('data-answered')) return;
  chosen.setAttribute('data-chosen', '');
  group.setAttribute('data-answered', '');
  group.querySelectorAll<HTMLButtonElement>('.opt').forEach((option) => option.setAttribute('aria-disabled', 'true'));

  const correct = chosen.hasAttribute('data-correct');
  const result = questionEl.querySelector<HTMLElement>('.sc-result');
  if (result) result.textContent = correct ? 'Правильно. Прочитайте пояснення до інших варіантів.' : 'Не зовсім. Правильний варіант позначено, пояснення — під кожним варіантом.';

  const answered = section.querySelectorAll('.options[data-answered]').length;
  const detail: SelfCheckDetail = {
    topic: section.dataset['topic'],
    question: Number(questionEl.dataset['question'] ?? 0),
    correct,
    answered,
    total: Number(section.dataset['total'] ?? 0),
  };
  document.dispatchEvent(new CustomEvent<SelfCheckDetail>('ku:selfcheck', { detail }));
}

export function initSelfChecks(): void {
  document.querySelectorAll<HTMLElement>('[data-selfcheck]').forEach((section) => {
    if (section.dataset['ready']) return;
    section.dataset['ready'] = 'true';
    section.addEventListener('click', (event) => {
      const chosen = (event.target as HTMLElement).closest<HTMLButtonElement>('.opt');
      const questionEl = chosen?.closest<HTMLElement>('.sc-q');
      if (chosen && questionEl) answer(section, questionEl, chosen);
    });
  });
}
