import type { MeetingScenario } from '../types';

/**
 * Навчальний сценарій за мотивами кейсу «Зоря-113»: 10 000 голосуючих акцій, частина довіреностей
 * недійсна, три питання з різними вимогами до більшості й кумулятивне обрання ради.
 *
 * Розрахунок для перевірки:
 * - Реєстрація: Агроінвест 4 200 (особисто) + Коваленко 1 500 (довіреність) + Шевчук 800 (новіша довіреність
 *   дійсна) + Дрібні акціонери 1 000 (особисто) = 7 500. Мельник 1 000 — довіреність недійсна; Бондар 1 500 — не з’явився.
 * - Кворум: більше 50% від 10 000 → 5 001; 7 500 ≥ 5 001 → є.
 * - Річний звіт (проста): за 4 200 + 800 = 5 000 (голос Мельник не рахується); потрібно 3 751 → прийнято.
 * - Зміни статуту (3/4): за 4 200 + 1 000 = 5 200; потрібно floor(7 500 × 3/4) + 1 = 5 626 → не прийнято.
 * - Рада, 3 місця: голоси Агроінвест 12 600 (c1 6 300, c2 6 300); Коваленко 4 500 → c4; Шевчук 2 400 → c4;
 *   Дрібні — 3 001 при праві на 3 000 → бюлетень недійсний. c4 6 900, c1 6 300, c2 6 300, c3 0 → обрано c4, c1, c2.
 */
export function zoriaScenario(): MeetingScenario {
  return {
    id: 'zoria-annual-meeting',
    title: 'Річні загальні збори ПрАТ «Зоря»',
    company: 'ПрАТ «Зоря» (навчальний кейс за мотивами)',
    shareholders: [
      { id: 'agroinvest', name: 'ТОВ «Агроінвест»', shares: 4_200 },
      { id: 'kovalenko', name: 'Коваленко О.', shares: 1_500 },
      { id: 'melnyk', name: 'Мельник І.', shares: 1_000 },
      { id: 'shevchuk', name: 'Шевчук Т.', shares: 800 },
      { id: 'bondar', name: 'Бондар Н.', shares: 1_500 },
      { id: 'small-holders', name: 'Дрібні акціонери (разом)', shares: 1_000 },
    ],
    proxies: [
      { id: 'p1', shareholderId: 'kovalenko', representative: 'Петренко В.', issuedOn: '2026-03-02', valid: true },
      { id: 'p2', shareholderId: 'melnyk', representative: 'Ткач Р.', issuedOn: '2026-03-05', valid: false, defect: 'довіреність не посвідчена нотаріусом або депозитарною установою' },
      { id: 'p3', shareholderId: 'shevchuk', representative: 'Лисенко К.', issuedOn: '2026-02-20', valid: false, defect: 'строк дії довіреності минув' },
      { id: 'p4', shareholderId: 'shevchuk', representative: 'Гнатюк М.', issuedOn: '2026-03-10', valid: true },
    ],
    attendance: [
      { shareholderId: 'agroinvest', via: 'personal' },
      { shareholderId: 'kovalenko', via: 'proxy' },
      { shareholderId: 'melnyk', via: 'proxy' },
      { shareholderId: 'shevchuk', via: 'proxy' },
      { shareholderId: 'small-holders', via: 'personal' },
    ],
    agenda: [
      {
        id: 'annual-report',
        kind: 'resolution',
        title: 'Затвердження річного звіту',
        majority: 'simple',
        votes: [
          { shareholderId: 'agroinvest', choice: 'for' },
          { shareholderId: 'kovalenko', choice: 'against' },
          { shareholderId: 'melnyk', choice: 'for' },
          { shareholderId: 'shevchuk', choice: 'for' },
          { shareholderId: 'small-holders', choice: 'abstain' },
        ],
      },
      {
        id: 'charter-amendments',
        kind: 'resolution',
        title: 'Внесення змін до статуту',
        majority: 'qualified',
        votes: [
          { shareholderId: 'agroinvest', choice: 'for' },
          { shareholderId: 'kovalenko', choice: 'against' },
          { shareholderId: 'shevchuk', choice: 'abstain' },
          { shareholderId: 'small-holders', choice: 'for' },
        ],
      },
      {
        id: 'supervisory-board',
        kind: 'cumulative-election',
        title: 'Обрання членів наглядової ради',
        seats: 3,
        candidates: [
          { id: 'c1', name: 'Олійник А.' },
          { id: 'c2', name: 'Савчук Б.' },
          { id: 'c3', name: 'Руденко Г.' },
          { id: 'c4', name: 'Кравець Д. (незалежний)' },
        ],
        ballots: [
          { shareholderId: 'agroinvest', allocation: { c1: 6_300, c2: 6_300 } },
          { shareholderId: 'kovalenko', allocation: { c4: 4_500 } },
          { shareholderId: 'melnyk', allocation: { c3: 3_000 } },
          { shareholderId: 'shevchuk', allocation: { c4: 2_400 } },
          { shareholderId: 'small-holders', allocation: { c3: 3_000, c4: 1 } },
        ],
      },
    ],
  };
}
