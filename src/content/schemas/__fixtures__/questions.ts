/** Мінімальні валідні приклади кожного типу питання — водночас документація формату. */

const LAW_REF = {
  act: 'Закон України «Про акціонерні товариства» № 2465-IX',
  article: 'ст. 39',
  checkedAt: '2026-09-01',
};

export function multichoiceSingle() {
  return {
    id: 't04-q001',
    type: 'multichoice',
    topic: 't04',
    bloom: 'remember',
    single: true,
    stem: 'Який орган є вищим органом акціонерного товариства?',
    generalFeedback: 'Вищий орган АТ — загальні збори акціонерів.',
    lawRef: [LAW_REF],
    answers: [
      { text: 'Загальні збори акціонерів', fraction: 100, feedback: 'Так, це вищий орган товариства.' },
      { text: 'Наглядова рада', fraction: 0, feedback: 'Наглядова рада контролює виконавчий орган.' },
      { text: 'Виконавчий орган', fraction: 0, feedback: 'Виконавчий орган керує поточною діяльністю.' },
    ],
  };
}

export function multichoiceMulti() {
  return {
    id: 't05-q002',
    type: 'multichoice',
    topic: 't05',
    bloom: 'understand',
    single: false,
    stem: 'Які з наведених комітетів зазвичай утворює наглядова рада?',
    generalFeedback: 'Типові комітети — аудиторський і з винагород.',
    answers: [
      { text: 'Аудиторський комітет', fraction: 50, feedback: 'Правильно.' },
      { text: 'Комітет з винагород', fraction: 50, feedback: 'Правильно.' },
      { text: 'Ревізійна комісія', fraction: -100, feedback: 'Це окремий орган, а не комітет ради.' },
    ],
  };
}

export function trueFalse() {
  return {
    id: 't01-q003',
    type: 'truefalse',
    topic: 't01',
    bloom: 'remember',
    stem: 'Агентська проблема виникає через відокремлення власності від контролю.',
    generalFeedback: 'Інтереси менеджерів і власників можуть не збігатися.',
    correct: true,
    feedbackTrue: 'Так, саме відокремлення створює конфлікт інтересів.',
    feedbackFalse: 'Ні: без відокремлення власник сам контролює рішення.',
  };
}

export function matching() {
  return {
    id: 't02-q004',
    type: 'matching',
    topic: 't02',
    bloom: 'understand',
    stem: 'Установіть відповідність між моделлю корпоративного управління та її ознакою.',
    generalFeedback: 'Моделі різняться структурою власності й роллю банків.',
    pairs: [
      { prompt: 'Англо-американська', answer: 'Розпорошена власність', feedback: 'Акції розподілені між багатьма інвесторами.' },
      { prompt: 'Німецька', answer: 'Дворівнева рада', feedback: 'Наглядова рада відокремлена від правління.' },
    ],
    distractors: ['Відсутність ради'],
  };
}

export function numerical() {
  return {
    id: 't07-q005',
    type: 'numerical',
    topic: 't07',
    bloom: 'apply',
    stem: 'Чистий прибуток 650 000 грн, на дивіденди — 50%, акцій 10 000. Який дивіденд на акцію, грн?',
    generalFeedback: '650 000 × 0,5 / 10 000 = 32,5 грн.',
    answers: [{ value: 32.5, tolerance: 0.01, fraction: 100, feedback: 'Правильно: 32,5 грн.' }],
  };
}

export function calculated() {
  return {
    id: 't07-q006',
    type: 'calculated',
    topic: 't07',
    bloom: 'apply',
    stem: 'Чистий прибуток {p} тис. грн, частка на дивіденди {r}%, акцій {n} тис. Який дивіденд на акцію, грн?',
    generalFeedback: 'Дивіденд на акцію = прибуток × частка / кількість акцій.',
    answers: [{ formula: '{p} * {r} / 100 / {n}', fraction: 100, feedback: 'Формула: p × r / 100 / n.' }],
    datasets: [
      { name: 'p', min: 500, max: 900, decimals: 0 },
      { name: 'r', min: 20, max: 60, decimals: 0 },
      { name: 'n', min: 5, max: 20, decimals: 0 },
    ],
  };
}

export function ddwtos() {
  return {
    id: 't04-q007',
    type: 'ddwtos',
    topic: 't04',
    bloom: 'understand',
    stem: 'Кворум загальних зборів — це [[1]] голосуючих акцій, а рішення ухвалюють [[2]] голосів.',
    generalFeedback: 'Кворум і більшість для рішення — різні пороги.',
    choices: [
      { text: 'понад 50%', feedback: 'Поріг кворуму.' },
      { text: 'простою більшістю', feedback: 'Типова більшість для рішення.' },
      { text: '10%', feedback: 'Такого порогу кворуму немає.' },
    ],
  };
}

export function multianswer() {
  return {
    id: 't04-q008',
    type: 'multianswer',
    topic: 't04',
    bloom: 'analyze',
    stem: 'Кумулятивне голосування застосовують під час обрання {#1}. Мінімальний пакет для 1 місця з 5 при 600 акціях: {#2}.',
    generalFeedback: 'S·k/(N+1)+1 = 600·1/6+1 = 101.',
    subquestions: [
      {
        kind: 'multichoice',
        answers: [
          { text: 'членів наглядової ради', fraction: 100, feedback: 'Так.' },
          { text: 'аудитора', fraction: 0, feedback: 'Ні.' },
        ],
      },
      {
        kind: 'numerical',
        answers: [{ value: 101, tolerance: 0, fraction: 100, feedback: 'Правильно.' }],
      },
    ],
  };
}

export function allQuestionExamples() {
  return [
    multichoiceSingle(),
    multichoiceMulti(),
    trueFalse(),
    matching(),
    numerical(),
    calculated(),
    ddwtos(),
    multianswer(),
  ];
}
