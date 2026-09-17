# Рушії курсу (`src/engines`)

Чистий TypeScript без DOM і React: однакові для сайту (React-острови) і SCORM-пакетів.

Спільні правила:

- Функції чисті, вхідні дані не змінюються, стан — незмінні серіалізовні об'єкти.
- Помилки користувача повертаються як `Result` (`{ ok: true, value }` або `{ ok: false, error }`) із кодом і повідомленням українською. Винятки лишаються тільки для помилок програміста.
- Випадковість іде лише через `RandomSource` (`shared/random.ts`, `createSeededRandom(seed)`). Результат відтворюється за зерном.
- Числа показуємо через `shared/number-format.ts` (`Intl.NumberFormat('uk-UA')`), а читаємо через `shared/decimal-input.ts`. Парсер приймає «1,5», «1.5» і «1 234,5» зі звичайним, нерозривним (U+00A0) або вузьким нерозривним (U+202F) пробілом.

## `shared/`

| Модуль | API |
|---|---|
| `random.ts` | `createSeededRandom(seed)`, `randomInt`, `shuffled` (повертає копію), `pickOne` |
| `decimal-input.ts` | `parseMoodleNumber(text)` → `{ value, rest }` (порт `apply_units` Moodle), `parseDecimalInput(text)` → `number \| null` |
| `number-format.ts` | `formatNumber`, `formatMoney` («32,50 грн»), `formatPercent` («12,5 %»), `roundTo` (округлення «від нуля», як у PHP) |
| `result.ts` | `Result<T, E>`, `ok`, `err` |

## `quiz/` — тренувальний тест з оцінюванням як у Moodle 5.2

Типи питань відповідають схемі банку (`src/content/schemas/questions.ts`). Як оцінюється кожен тип і де можливі розбіжності з Moodle, описано в коментарі `quiz/index.ts`.

Цикл спроби:

```ts
const attempt0 = startAttempt({ quizId, questions, random: createSeededRandom(seed), now, mode: 'immediate' });
const step = answerQuestion(attempt0, questions, slotIndex, response, now); // Result<QuizAttempt, AttemptError>
const finished = finishAttempt(attempt, questions, now);
const summary = summarizeAttempt(finished);          // бали, percent, score 0..1, лічильники станів
const review = reviewQuestion(question, slot.layout, slot.response); // пояснення до кожного варіанта
```

Контракт для UI-островів:

- Порядок показу бере `slot.layout` (`order`, `stemOrder`, `choiceOrder`, `partOrders`). Відповідь (`QuestionResponse`) завжди містить індекси в масивах банку, а не в перемішаному порядку.
- `mode: 'immediate'`: відповідь оцінюється одразу і більше не змінюється. `mode: 'deferred'`: оцінка з'являється тільки після `finishAttempt`.
- Якщо відповідь неповна або некоректна, `answerQuestion` повертає `invalid-response` з `issue.message` для показу біля поля. Повідомлення зібрано в `RESPONSE_ISSUE_MESSAGES`.
- `attemptSummaryText(summary)` дає текст для `aria-live`, `questionStateLabel(state)` — підпис поруч зі знаком стану.
- `validateFormula(formula, { variables })` — окремий валідатор формул calculated для схеми банку. `generateDatasetItems(question)` — стабільний набір значень, який варто вивантажити в Moodle XML, щоб варіанти на сайті й у Moodle збігалися.

SCORM:

- `toScormReport(summary, { passPercent? })` → `{ scoreRaw (0..100), scoreMin, scoreMax, lessonStatus }`.
- `toScormCmiValues(report)` → рядки для `LMSSetValue`. `score.raw` обмежено відрізком 0..100, хоча в Moodle сума балів може бути від'ємною.

## `progress/` — сховище прогресу (схема v2)

- Інтерфейс `ProgressStore` лишився тим самим: `load`, `save`, `clear`, `flush`, `isPersistent`. Реалізації — localStorage, пам'ять і SCORM 1.2 (`scorm-store.ts`).
- **SCORM** (`createScormProgressStore({ activityId, masteryPercent, onNotice })`): API шукається за алгоритмом ADL (`findScormApi`: предки вікна до 7 рівнів, потім `opener`). Увесь стан — у `cmi.suspend_data` (≤ 4096 символів): короткий JSON як є, довгий — `z1:` + base64(deflate), а якщо й так не вміщається — відкидаються найстаріші `recentEventIds` з повідомленням `history-trimmed` (`suspend-data.ts`). Бал `cmi.core.score.raw` = найкращий результат `activities[activityId]` × 100, `lesson_status` — `passed`/`failed` за прохідним балом (перевага в `cmi.student_data.mastery_score` від LMS), без результату — `incomplete`. Кожне `save` одразу робить `LMSCommit`; `terminate` (на `pagehide` через `attachScormLifecycle`) пише `exit = suspend`, `session_time` і `LMSFinish`. Без API або після збою LMS стан живе в пам'яті, а `scormNoticeText(notice)` дає пояснення українською.
- Острови підставляють сховище через `installProgressStore(store)` з `components/progress/client.ts` до першого `getProgressClient()`; сайт цю функцію не викликає.
- **Версія 2** додала `xpLedger` (уже нараховані XP за сутністю), `badges` як запис `{ [id]: { awardedAt } }` (раніше це був масив), `recentEventIds` (останні 100 ID подій) і необов'язкове `activities[id].solvedVariants`.
- Міграція 1 → 2 (`migrate-v1-to-v2.ts`) перевіряє дані за замороженою схемою `schema-v1.ts`, відновлює журнал XP із записаного прогресу, ніколи не зменшує XP і ставить бейджам дату останнього оновлення v1.
- `exportProgressCode(state)` тепер повертає `{ ok: true, code }` або `{ ok: false, error: 'too-large' | 'invalid-state' }`. Повідомлення лежать у `PROGRESS_CODE_EXPORT_ERROR_MESSAGES`.
- `importProgressCode` перевіряє довжину сирого тексту до нормалізації: межа — `MAX_PROGRESS_CODE_INPUT_LENGTH`.
- Якщо запис завеликий, у резервну копію localStorage потрапляє лише маркер `{ truncated, originalLength, prefix }`.

## `gamification/` — XP, рівні, бейджі

```ts
const result = applyLearningEvent(state, { id: 'quiz:t04-training:1757930400000', type: 'quiz-finished', quizId: 't04-training', score: summary.score }, now);
if (result.ok) { store.save(result.value.state); announce(eventOutcomeText(result.value)); }
```

- Типи подій: `topic-read`, `self-check-passed`, `quiz-finished`, `flashcards-reviewed`, `case-completed`, `trainer-completed` (з необов'язковим `variantId`).
- XP за подію (`XP_RULES`): тема — 100, самоперевірка — 20, тест — 150 × найкращий результат, колода карток — 30 × частка засвоєних, кейс — 80 × результат, тренажер — 60 × результат.
- Повтор дає лише приріст понад попередній найкращий результат. Подію з уже обробленим `id` просто ігнорують.
- Рівні `LEVELS` (0 / 500 / 1200 / 2200 / 3400). ID збігаються з `src/lib/player-levels.ts`. `levelProgress(xp)` повертає дані для метра.
- `BADGES` — 9 бейджів із предикатами над станом. Тренажери мають надсилати події з ID із `BADGE_ACTIVITY_IDS`.
- Тексти: `formatXp`, `xpGainText`, `nextLevelText`, `levelPositionText`, `badgesEarnedText`, `newBadgesText`, `eventOutcomeText`.

## `calculators/` — калькулятори практичних

Кожна функція повертає `CalcResult<T>`. Помилка має вигляд `{ code, field, message }`, тож NaN чи Infinity назовні не потрапляють. Текст із поля вводу розбирає `parseCalculatorInput(text, { field, label })`.

| Модуль | API |
|---|---|
| `meeting-rules.ts` | `calculateQuorum`, `decideResolution`, `minimumAbove`, `DEFAULT_MEETING_RULES` (ст. 40 ч. 1, ст. 53 ч. 4, ст. 106 ч. 3 Закону № 2465-IX). Норми передаються аргументом `rules` |
| `cumulative-voting.ts` | `cumulativeVotes`, `minimumStakeForSeats` (floor(S·k/(N+1)) + 1), `guaranteedSeats` |
| `profit-distribution.ts` | `distributeProfit`: резерв → привілейовані → прості; виплати акціонерам; перевірка чистих активів (`netAssetsRule`) |
| `dupont.ts` | `dupontAnalysis`, `growthRates`, `compareGrowth` |
| `securities.ts` | `earningsPerShare`, `priceToEarnings`, `dividendYield`, `bondPrice`, `currentYield`, `yieldToMaturity` (бісекція з межею ітерацій), `discountYield` |
| `generators.ts` | `generateQuorumTask`, `generateCumulativeTask`, `generateDividendTask`, `generateDupontTask`, `generateBondTask`: seeded-генератори з «красивими» числами, кожен повертає `variantId` |

Еталонні приклади з розписаним розрахунком: `calculators/__fixtures__/reference-cases.ts`.

## `matrix/` — тренажер-матриця практичних

Дані — `content/practicals/pNN.yaml` → `trainer` (моделі, ознаки, клітинки з поясненням і джерелом, завдання «визнач модель»).

```ts
let session = startMatrixSession({ matrix, seed: `p01:${Date.now()}:0`, now });   // спроба 1 — навчальна
let attempt = currentAttempt(session);
attempt = unwrap(selectModel(attempt, matrix, itemId, 'german'));                   // null — зняти вибір
attempt = unwrap(checkFeature(attempt, matrix, featureId));                          // лише навчальна: фіксує ознаку, відкриває розбір
session = replaceCurrentAttempt(session, unwrap(finishMatrixAttempt(attempt, matrix, now)));
session = unwrap(startGradedAttempt(session, matrix, now));                          // спроба 2 — оцінювана, інше перемішування
const summary = summarizeMatrixAttempt(finished, matrix);                            // right, total, share, за ознаками й моделями
const mark = rubricMark(unwrap(rubricBandsFromLevels(criterion.levels)), summary.right, summary.total);
const event = matrixCompletedEvent(finished, summary, 'p01');                        // trainer-completed, activityId p01-model-matrix
```

- `reviewItem` до розкриття (навчальна — до перевірки ознаки, оцінювана — до завершення) не повертає правильної моделі й пояснення; `attemptProgress` рахує правильні лише серед розкритих.
- Пропуски в оцінюваній спробі — неправильні. Помилки користувача — `Result` з повідомленням з `MATRIX_ERROR_MESSAGES`.
- Поріг рубрики читається з опису рівня реєстру («не менше 90%», «60–89%»); межа включна й без похибки округлення (`right·100 ≥ min·total`).
- `gradeCompanyTask(task, matrix, { model, features })`: рівно дві ознаки; `right` / `partial` (модель правильна, ознаки не ключові) / `wrong`, з формулюваннями ключових ознак для правильної моделі.
- Тексти для `aria-live`: `featureCheckText`, `matrixSummaryText`, `recordedResultText`, `itemStateLabel`.

## `simulations/`

### `auction/` — аукціон заявок

- `clearCallAuction(orders, { referencePrice })` → ціна, обсяг, таблиця рівнів, крок правила вибору ціни (`decidedBy`) і виконання заявок.
- Раунди гри: `startAuctionGame`, `submitOrder` (резервує кошти й акції), `withdrawOrder`, `clearRound`, `nextRound`.
- `roundSummaryText(record)` дає текст для `aria-live`.

### `general-meeting/` — симуляція загальних зборів

- `createMeetingSimulation(scenario, rules?)` → `{ scenes, state }`. Сцени: брифінг → реєстрація → кворум → питання порядку денного → протокол.
- Переходи: `answerScene` фіксує відповідь один раз, `advanceScene` не пропускає далі без відповіді. Допоміжні функції: `currentScene`, `meetingScore` (частка 0..1 для `trainer-completed`).
- Доступність: при зміні сцени фокус переходить на заголовок `scene.title`. Після відповіді `scene.explanation` зачитується через `aria-live`.
- Окремо доступні: `registerShareholders`, `tallyResolution`, `electBoard`, `validateScenario`.

### `board-game/` — кейс-гра «Рішення ради»

- Граф: вузли-рішення з наслідками для `trust`, `value`, `risk` і умовними переходами, плюс фінали `best`, `good`, `poor`.
- `validateBoardGame(game)` перевіряє старт, цілі переходів, досяжність, тупики й цикли без виходу.
- Гра: `startBoardGame`, `chooseOption` (повертає новий стан, `feedback` і фактичні `effects`), `gameScore` (1 / 0,6 / 0,2), `metricsText` для скрінрідерів.
- `serializeGameState` / `restoreGameState` зберігають лише вибори (≤ 4000 символів, вміщується в `cmi.suspend_data`). Метрики відтворюються повторним проходженням, тому підробити їх не можна.

## Тести

`npm test`, `npm run test:coverage`. Покриття `src/engines/**` — щонайменше 80% рядків і гілок. Тести пишуться за AAA, фікстури лежать у `__fixtures__/`.
