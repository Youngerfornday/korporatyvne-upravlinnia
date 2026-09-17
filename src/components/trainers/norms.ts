/**
 * Посилання на норми для тренажерів — рядки docs/research/legal-baseline.md (код рядка, стаття, пряме посилання,
 * дата перевірки). Самі числа (пороги, формули) бере рушій калькуляторів; тут лише звідки вони.
 * Дати: «Ключові числа для тестів» — 2026-09-15; решта рядків розділу 1 — 2026-09-14 (правило 2 документа).
 */
export interface NormRef {
  readonly code: string;
  readonly article: string;
  readonly law: string;
  readonly url: string;
  readonly checkedAt: string;
  /** Що саме встановлює норма — власними словами. */
  readonly summary: string;
}

const LAW_2465 = 'Закон № 2465-IX';
const LAW_2465_URL = 'https://zakon.rada.gov.ua/laws/show/2465-20';
const KEY_NUMBERS_CHECKED = '2026-09-15';
const SECTION_CHECKED = '2026-09-14';

export const NORMS = {
  quorum: {
    code: 'AT-26',
    article: 'ст. 40 ч. 1',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n429`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Рахують від голосуючих акцій на момент закінчення реєстрації; акції юросіб під контролем товариства не враховуються.',
  },
  simpleMajority: {
    code: 'AT-38',
    article: 'ст. 53 ч. 4',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n617`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Загальне правило для рішень загальних зборів.',
  },
  qualifiedMajority: {
    code: 'AT-38',
    article: 'ст. 53 ч. 6 абз. 1',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n622`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Зміни статуту, зміна типу чи структури управління, емісія, зміна статутного капіталу, припинення.',
  },
  preemptiveWaiver: {
    code: 'AT-38',
    article: 'ст. 53 ч. 6 абз. 2',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n623`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Рішення не використовувати переважне право акціонерів під час емісії.',
  },
  significantTransaction: {
    code: 'AT-62',
    article: 'ст. 106 ч. 3 абз. 3',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n1468`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Значний правочин на 50\u00A0% активів і більше: база — усі голосуючі акції, а не лише зареєстровані.',
  },
  cumulativeMechanics: {
    code: 'AT-39',
    article: 'ст. 53 ч. 5',
    law: LAW_2465,
    url: LAW_2465_URL,
    checkedAt: SECTION_CHECKED,
    summary: 'Голоси акціонера множаться на кількість місць; їх можна віддати одному кандидату або розподілити; обрані — ті, хто набрав найбільше.',
  },
  cumulativeMandatory: {
    code: 'AT-39',
    article: 'ст. 72 ч. 10',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n887`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Кумулятивне голосування обов’язкове для обрання наглядової ради ПАТ і банку.',
  },
  dividendDefinition: {
    code: 'AT-16',
    article: 'ст. 34 ч. 1–2',
    law: LAW_2465,
    url: LAW_2465_URL,
    checkedAt: SECTION_CHECKED,
    summary: 'Дивіденд — частина чистого прибутку на одну акцію, однаковий для акцій одного типу і класу, лише грошима.',
  },
  reserveCapital: {
    code: 'AT-10',
    article: 'ст. 16 ч. 4–5',
    law: LAW_2465,
    url: LAW_2465_URL,
    checkedAt: SECTION_CHECKED,
    summary: 'Порядок формування резервного капіталу визначає статут; відсоткового мінімуму закон не встановлює.',
  },
  netAssetsRule: {
    code: 'AT-19',
    article: 'ст. 35 ч. 1 п. 2',
    law: LAW_2465,
    url: `${LAW_2465_URL}#n362`,
    checkedAt: KEY_NUMBERS_CHECKED,
    summary: 'Не можна вирішувати платити за простими акціями, якщо власний капітал менший (або стане меншим) за статутний + резервний капітал + перевищення ліквідаційної вартості привілейованих над номіналом.',
  },
  preferredFirst: {
    code: 'AT-19',
    article: 'ст. 35 ч. 2',
    law: LAW_2465,
    url: LAW_2465_URL,
    checkedAt: SECTION_CHECKED,
    summary: 'Не можна платити за простими акціями, якщо не сповна виплачено дивіденди за привілейованими.',
  },
} as const satisfies Record<string, NormRef>;

export type NormId = keyof typeof NORMS;

/** Формула мінімального пакета — не норма закону (legal-baseline, «Не підтверджено», п. 13). */
export const CUMULATIVE_FORMULA_NOTE =
  'Формулу S·k/(N+1)+1 закон не встановлює — це математичне правило: пакет має бути строго більшим за частку S·k/(N+1), бо за рівності суперник може зрівнятися.';
