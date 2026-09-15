import type { BoardGame } from '../types';

/**
 * Навчальна кейс-гра «Рішення ради» (скорочена версія для тестів).
 * Шляхи для перевірки (довіра / вартість / ризик, старт 50 / 50 / 40):
 * - independent-review → balanced: 60/50/30 → 70/60/25, довіра ≥ 60 → ending-best;
 * - approve-now → hide: 30/55/65 → 5/60/95, ризик ≥ 70 → ending-scandal;
 * - approve-now → disclose → balanced: 30/55/65 → 45/50/50 → 55/60/45, довіра < 60 → ending-good;
 * - reject → comply: 45/40/40 → 35/25/50 → ending-poor.
 */
export function boardGame(): BoardGame {
  return {
    id: 'board-decision-game',
    title: 'Рішення ради',
    startNodeId: 'related-party',
    initialMetrics: { trust: 50, value: 50, risk: 40 },
    nodes: [
      {
        id: 'related-party',
        kind: 'decision',
        title: 'Правочин із заінтересованістю',
        text: 'Генеральний директор пропонує договір поставки з компанією, де його брат володіє 30%. Сума — 12% активів.',
        options: [
          {
            id: 'approve-now',
            label: 'Схвалити одразу, щоб не зірвати поставку',
            feedback: 'Рада обійшла перевірку ринковості умов — довіра акціонерів падає.',
            effects: { trust: -20, value: 5, risk: 25 },
            next: 'audit-finding',
          },
          {
            id: 'independent-review',
            label: 'Доручити аудиторському комітету перевірити ринковість умов',
            feedback: 'Незалежна перевірка — стандарт для правочинів із заінтересованістю.',
            effects: { trust: 10, risk: -10 },
            next: 'dividend',
          },
          {
            id: 'reject',
            label: 'Відхилити без розгляду',
            feedback: 'Ризик знято, але компанія втратила вигідного постачальника.',
            effects: { trust: -5, value: -10 },
            next: 'dividend',
          },
        ],
      },
      {
        id: 'audit-finding',
        kind: 'decision',
        title: 'Висновок аудитора',
        text: 'Внутрішній аудит виявив, що ціна договору завищена на 18%.',
        options: [
          {
            id: 'disclose',
            label: 'Розкрити інформацію й переглянути договір',
            feedback: 'Прозорість відновлює довіру, хоча короткостроково коштує грошей.',
            effects: { trust: 15, value: -5, risk: -15 },
            next: 'dividend',
          },
          {
            id: 'hide',
            label: 'Не розкривати, щоб не впали акції',
            feedback: 'Приховування порушує обов’язки ради й накопичує ризик.',
            effects: { trust: -25, value: 5, risk: 30 },
            next: { when: [{ condition: { metric: 'risk', atLeast: 70 }, goto: 'ending-scandal' }], otherwise: 'dividend' },
          },
        ],
      },
      {
        id: 'dividend',
        kind: 'decision',
        title: 'Дивідендна політика',
        text: 'Мажоритарій вимагає виплатити 90% прибутку попри інвестиційну програму.',
        options: [
          {
            id: 'balanced',
            label: 'Запропонувати 40% і пояснити інвестиційну програму',
            feedback: 'Збалансована політика враховує інтереси всіх акціонерів.',
            effects: { trust: 10, value: 10, risk: -5 },
            next: { when: [{ condition: { metric: 'trust', atLeast: 60 }, goto: 'ending-best' }], otherwise: 'ending-good' },
          },
          {
            id: 'comply',
            label: 'Погодитися на 90%',
            feedback: 'Інвестиційну програму зупинено, міноритарії втрачають майбутню вартість.',
            effects: { trust: -10, value: -15, risk: 10 },
            next: 'ending-poor',
          },
        ],
      },
      { id: 'ending-best', kind: 'ending', title: 'Рада, якій довіряють', text: 'Акціонери підтримують раду, вартість зростає.', rating: 'best' },
      { id: 'ending-good', kind: 'ending', title: 'Компроміс', text: 'Компанія стабільна, але довіру ще треба відновлювати.', rating: 'good' },
      { id: 'ending-poor', kind: 'ending', title: 'Вартість проїдено', text: 'Короткострокові виплати підірвали розвиток.', rating: 'poor' },
      { id: 'ending-scandal', kind: 'ending', title: 'Корпоративний скандал', text: 'НКЦПФР починає перевірку, акції падають.', rating: 'poor' },
    ],
  };
}
