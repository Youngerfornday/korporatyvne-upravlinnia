/** Мінімальний набір даних конструктора для тестів: дві форми, два критерії, правила всіх трьох ефектів. */
import type { ChoiceDefinition } from '../choice';
import type { RegistrySeriesDefinition } from '../types';

export const CHOICE: ChoiceDefinition = {
  forms: [
    { id: 'tov', title: 'Товариство з обмеженою відповідальністю', short: 'ТОВ', summary: 'Частки, статут, збори учасників.' },
    { id: 'prat', title: 'Приватне акціонерне товариство', short: 'ПрАТ', summary: 'Акції, наглядова рада, депозитарій.' },
  ],
  criteria: [
    {
      id: 'investor',
      title: 'Інвестор',
      question: 'Хто входить у капітал?',
      options: [
        { id: 'founders', label: 'Лише засновники' },
        { id: 'venture', label: 'Венчурний фонд' },
      ],
    },
    {
      id: 'budget',
      title: 'Бюджет на старт',
      question: 'Скільки готові витратити на створення?',
      options: [
        { id: 'small', label: 'Мінімальний' },
        { id: 'large', label: 'Без обмежень' },
      ],
    },
  ],
  rules: [
    { form: 'tov', criterion: 'investor', option: 'founders', effect: 'fits', reason: 'Частки й статут достатні.', norm: 'tov-uchasnyky' },
    { form: 'tov', criterion: 'budget', option: 'small', effect: 'fits', reason: 'Мінімального капіталу закон не встановлює.', norm: 'tov-kapital' },
    { form: 'prat', criterion: 'budget', option: 'small', effect: 'blocks', reason: 'Потрібен мінімальний статутний капітал.', norm: 'at-kapital' },
    { form: 'prat', criterion: 'investor', option: 'venture', effect: 'burden', reason: 'Емісія і депозитарій коштують грошей.', norm: 'at-kapital' },
  ],
};

export const SERIES: RegistrySeriesDefinition = {
  forms: [
    { key: 'at', title: 'Акціонерні товариства', short: 'АТ' },
    { key: 'tov', title: 'Товариства з обмеженою відповідальністю', short: 'ТОВ' },
  ],
  points: [
    { date: '2020-01-01', generation: 'pre-2022', source: 'edrpou-2020', values: { at: 13_902, tov: 674_437 } },
    { date: '2021-01-01', generation: 'pre-2022', source: 'edrpou-2021', values: { at: 13_748, tov: 707_403 } },
    { date: '2026-01-01', generation: 'since-2022', source: 'sdmx', values: { at: 13_451, tov: 836_712 } },
  ],
};
