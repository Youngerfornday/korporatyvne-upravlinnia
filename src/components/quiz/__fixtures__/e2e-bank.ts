/**
 * Фікстурний банк теми 1 лише для E2E: по одному питанню кожного типу. Не є навчальним контентом
 * і в content/ не потрапляє; підключається тільки збіркою з KU_E2E_BANK=1 (див. load-bank.ts).
 */
import { QuestionSchema, type Question } from '../../../content/schemas/questions';

export const E2E_BANK_TOPIC = 't01';

const LAW_REF = { act: 'Закон України «Про акціонерні товариства» № 2465-IX', article: 'ст. 3', checkedAt: '2026-09-01' };

const RAW_QUESTIONS = [
  {
    id: 't01-e2e-001',
    type: 'multichoice',
    topic: 't01',
    bloom: 'remember',
    single: true,
    stem: 'Що таке відокремлення власності від контролю?',
    generalFeedback: 'Власники не керують компанією безпосередньо — це роблять наймані менеджери.',
    lawRef: [LAW_REF],
    answers: [
      { text: 'Власники передають управління найманим менеджерам', fraction: 100, feedback: 'Так, саме це породжує агентську проблему.' },
      { text: 'Компанія не має власників', fraction: 0, feedback: 'Ні, власники є — вони просто не керують щодня.' },
      { text: 'Менеджери володіють усіма акціями', fraction: 0, feedback: 'Ні, тоді власність і контроль збігаються.' },
    ],
  },
  {
    id: 't01-e2e-002',
    type: 'multichoice',
    topic: 't01',
    bloom: 'understand',
    single: false,
    stem: 'Які механізми зменшують агентські витрати?',
    generalFeedback: 'Незалежна рада і винагорода за результат узгоджують інтереси менеджерів і власників.',
    answers: [
      { text: 'Незалежні директори в раді', fraction: 50, feedback: 'Так.' },
      { text: 'Винагорода, прив’язана до результату', fraction: 50, feedback: 'Так.' },
      { text: 'Заборона будь-яких дивідендів', fraction: -100, feedback: 'Ні, це не механізм контролю.' },
    ],
  },
  {
    id: 't01-e2e-003',
    type: 'truefalse',
    topic: 't01',
    bloom: 'remember',
    stem: 'Агентська проблема виникає через відокремлення власності від контролю.',
    generalFeedback: 'Інтереси менеджерів і власників можуть не збігатися.',
    correct: true,
    feedbackTrue: 'Так, саме відокремлення створює конфлікт інтересів.',
    feedbackFalse: 'Ні: без відокремлення власник сам контролює рішення.',
  },
  {
    id: 't01-e2e-004',
    type: 'matching',
    topic: 't01',
    bloom: 'understand',
    stem: 'Установіть відповідність між учасником і його роллю.',
    generalFeedback: 'Принципал доручає, агент виконує.',
    pairs: [
      { prompt: 'Акціонер', answer: 'Принципал', feedback: 'Власник доручає управління.' },
      { prompt: 'Менеджер', answer: 'Агент', feedback: 'Найманий керівник діє від імені власників.' },
    ],
    distractors: ['Аудитор'],
  },
  {
    id: 't01-e2e-005',
    type: 'numerical',
    topic: 't01',
    bloom: 'apply',
    stem: 'Компанія має 200 акцій, з них 30 належать менеджменту. Яка частка менеджменту у відсотках?',
    generalFeedback: '30 / 200 = 15 %.',
    answers: [{ value: 15, tolerance: 0.5, fraction: 100, feedback: 'Правильно: 15 %.' }],
  },
  {
    id: 't01-e2e-006',
    type: 'calculated',
    topic: 't01',
    bloom: 'apply',
    stem: 'Усього акцій {n}, у менеджменту {m}. Частка менеджменту у відсотках?',
    generalFeedback: 'Частка = m / n × 100.',
    answers: [{ formula: '{m} / {n} * 100', fraction: 100, tolerance: 0.01, feedback: 'Формула: m / n × 100.' }],
    datasets: [
      { name: 'n', min: 100, max: 1000, decimals: 0 },
      { name: 'm', min: 5, max: 90, decimals: 0 },
    ],
  },
  {
    id: 't01-e2e-007',
    type: 'ddwtos',
    topic: 't01',
    bloom: 'understand',
    stem: 'У агентських відносинах власник — це [[1]], а менеджер — це [[2]].',
    generalFeedback: 'Принципал доручає, агент виконує.',
    choices: [
      { text: 'принципал', feedback: 'Власник дає доручення.' },
      { text: 'агент', feedback: 'Менеджер діє від імені власника.' },
      { text: 'кредитор', feedback: 'Кредитор — зовнішній стейкхолдер.' },
    ],
  },
  {
    id: 't01-e2e-008',
    type: 'multianswer',
    topic: 't01',
    bloom: 'analyze',
    stem: 'Конфлікт між контролюючим акціонером і міноритаріями називають {#1}. Якщо в компанії 1000 акцій, а мажоритарію належить 600, його частка становить {#2} %.',
    generalFeedback: 'Це другий тип агентського конфлікту; 600 / 1000 = 60 %.',
    subquestions: [
      {
        kind: 'multichoice',
        answers: [
          { text: 'агентським конфліктом другого типу', fraction: 100, feedback: 'Так.' },
          { text: 'конфліктом кредиторів', fraction: 0, feedback: 'Ні.' },
        ],
      },
      { kind: 'numerical', answers: [{ value: 60, tolerance: 0, fraction: 100, feedback: 'Правильно.' }] },
    ],
  },
];

export function e2eBankQuestions(): Question[] {
  return RAW_QUESTIONS.map((raw) => QuestionSchema.parse(raw));
}
