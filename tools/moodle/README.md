# Moodle 5.2.2: збирання і відновлення курсу `.mbz` (спайк)

Мета спайку: до написання контенту довести, що резервну копію курсу можна зібрати скриптом у Moodle 5.2.2
(номер збірки 2026042002, як на eln.stu.cn.ua) і що викладач (роль editingteacher, не адміністратор) гарантовано
відновлює її в іншому, чистому Moodle. Усе нижче перевірено в Docker на `erseco/alpine-moodle:v5.2.2`, якщо
прямо не сказано «не перевірено».

Стан на 2026-09-15: повний прогін `./verify.sh` від нуля проходить (9 з 9 перевірок Playwright), 200 с.

## Зміст

1. [Склад каталогу](#склад-каталогу)
2. [Швидкий старт](#швидкий-старт)
3. [Що підтверджено і де докази](#що-підтверджено-і-де-докази)
4. [Точні API Moodle 5.2.2](#точні-api-moodle-522)
5. [Moodle XML: обов'язкові поля і схема банку](#moodle-xml-обовязкові-поля-і-схема-банку)
6. [Підводні камені](#підводні-камені)
7. [Знайдені дефекти відновлення в Moodle 5.2.2](#знайдені-дефекти-відновлення-в-moodle-522)
8. [Що не перевірено або не працює](#що-не-перевірено-або-не-працює)
9. [Експортер tools/export: рішення й перевірка імпорту](#експортер-toolsexport-рішення-й-перевірка-імпорту)
10. [Час і розміри](#час-і-розміри)
11. [Каркас фінального build-course.php](#каркас-фінального-build-coursephp)
12. [Інструкція для викладача eln](#інструкція-для-викладача-eln)

## Склад каталогу

| Шлях | Призначення |
|---|---|
| `compose.yaml` | PostgreSQL 16 + Moodle; один файл для обох інстансів, різниця лише в `env/*.env` |
| `env/build.env`, `env/verify.env` | project name, порт (8081/8082), локальні паролі (лише 127.0.0.1) |
| `docker/Dockerfile` | образ `ku-moodle:5.2.2` = `erseco/alpine-moodle:v5.2.2` + вшитий `vendor/` |
| `lib.sh`, `up.sh`, `down.sh` | запуск/зупинка; `down.sh <інстанс> --purge` видаляє контейнери і `.data/<інстанс>` |
| `backup.sh` | `admin/cli/backup.php` з вибором «з користувачами / без» |
| `verify.sh` | повний прогін від нуля, зведення в `out/verify-summary.txt` |
| `spike/setup-site.php` | мовний пакет uk, мова сайту uk, вимкнення пошти й турів |
| `spike/build-spike.php`, `spike/lib/*.php` | збирання мінімального курсу в інстансі build |
| `spike/setup-verify.php` | teacher1 (editingteacher), student1, порожні курси-цілі у verify |
| `spike/verify-helper.php` | JSON-стан курсу для перевірок (модулі, теги питань, фільтри слотів, журнал) |
| `spike/restore-cli.php` | контрольне відновлення через `restore_controller` від імені заданого користувача |
| `fixtures/` | `questions.xml`, `glossary-entries.xml`, джерела й ZIP Книги та SCORM, `make-zips.sh` |
| `e2e/` | Playwright (`@playwright/test` 1.63.0): `01-restore-as-teacher`, `02-restored-course` |
| `import-check.sh`, `import-check.php` | перевірка імпорту згенерованого `tools/export` XML (питання, глосарій, розділення видів банків) |
| `.data/`, `out/` | дані Docker і результати (у `.gitignore`); `out/evidence/` скидання не чіпає |

## Швидкий старт

```bash
cd tools/moodle
./verify.sh                    # усе від нуля: ~3-4 хв, наприкінці контейнери зупиняються
./verify.sh --leave-running    # те саме, але інстанси лишаються запущеними
```

Вручну:

```bash
./up.sh all                                   # http://localhost:8081 (build), http://localhost:8082 (verify)
fixtures/make-zips.sh
docker compose --env-file env/build.env exec -T moodle php /work/spike/build-spike.php
./backup.sh KU-SPIKE 0 ku-spike-nousers.mbz   # 0 = без даних користувачів (рекомендовано)
./down.sh all                                 # docker compose stop, дані й образи лишаються
```

Облікові дані в `env/*.env` - лише для локальних контейнерів, прив'язаних до 127.0.0.1.

## Що підтверджено і де докази

Файли `out/` (крім `out/evidence/`, куди докази збережено вручну) створює `verify.sh`; скріншоти - `out/screens/`,
звіт Playwright - `out/playwright-report.json`.

| # | Перевірка | Результат | Доказ |
|---|---|---|---|
| 1 | Два незалежні інстанси 5.2.2 (build/verify), PostgreSQL 16 | працює | `out/verify-run.log` |
| 2 | Мовний пакет uk через CLI, `decsep` = «,» | працює | `setup-site.php`, лог прогону |
| 3 | `phpunit_util::get_data_generator()` у CLI без PHPUnit; `tests/generator` у образі (76 каталогів) | працює | `out/spike-build.json` (0 PHP-попереджень) |
| 4 | Курс: 2 розділи, Книга (2 глави з ZIP, 2 SVG), Сторінка, URL, Глосарій (2 записи), Завдання з рубрикою (2 критерії, статус 20 = готова), Кейс-проєкт, банк mod_qbank + 10 питань 8 типів з тегами Блума, 2 тести, SCORM 1.2, 5 категорій журналу | працює, 1,6 с | `out/spike-build.json` |
| 5 | `admin/cli/backup.php` -> `.mbz` | 27 566 байт (без користувачів), 28 607 (з користувачами) | `out/backup.log` |
| 6 | Відновлення викладачем через веб у порожній курс (злиття), статус 1000 | працює, ~6 с після «Виконати відновлення» | `out/verify-restore-nousers.json`, `restore-nousers-*.png` |
| 6a | Копія з даними користувачів: для викладача параметр «Включити зареєстрованих користувачів» заблоковано правами (іконка замка), значення 0 | підтверджено | `out/verify-restore-users.json`, `restore-users-4-settings.png` |
| 7a | Розділи й діяльності видно студенту; банк питань студенту не видно | так | `course-1-student-view.png` |
| 7b | Книга: 2 глави, SVG через `<img>` відображаються (naturalWidth 480), посилання між главами переписано на `chapterid`, inline `<svg>` зберігся | так | `book-1-chapter1.png`, `book-2-chapter2.png`, `out/verify-course-checks.json` |
| 7c | Попередній перегляд тесту (6 спроб): кожен випадковий слот брав лише питання категорії Т01 зі своїм тегом; питання Т02 з тим самим тегом не випадали; за 6 спроб випали обидва кандидати кожного слота | так | `quiz-1-teacher-preview.png`, `randomPreview` у `verify-course-checks.json` |
| 7d | Студент (мова uk) вводить «1,5» у числове і «10,5» у Cloze: 4,00/4,00, оцінка 40/40 | так | `quiz-2-student-attempt.png`, `quiz-3-review-while-open.png` |
| 7e | Після спроби бали видно, правильність і правильні відповіді - ні (`.rightanswer` = 0); після закриття тесту з'являється «Правильна відповідь: 1,5» | так | `quiz-3-*.png`, `quiz-4-review-after-close.png` |
| 7f | SCORM запускається (`LMSInitialize: true`), бал 80 потрапляє в журнал, підсумок курсу не змінюється (40 до і після) | так | `scorm-1-player.png`, `grades-1-student-user-report.png` |
| 7g | Ваги категорій після відновлення: 24 / 24 / 12 / 40, «Тренажери» 0, підсумок 0..100 | так | `grades-2-teacher-setup.png` |
| 7h | Глосарій після відновлення порожній (обидві копії); викладач імпортує XML: 3 записи, 2 категорії | так | `glossary-1..3-*.png` |
| 7i | Контроль: адміністратор відновлює копію з користувачами - записів глосарію 2 | так | `out/control-admin-restore-users.json` |
| 7j | У мові en «1,5» розбирається як 15 з попередженням про роздільник тисяч; у uk і «1,5», і «1.5» дають 1,5 | так (CLI, `qtype_numerical_answer_processor`) | `out/evidence/numerical-separators-uk-en.txt` |

## Точні API Moodle 5.2.2

Код Moodle 5.1+ лежить у `/var/www/html/public`, а CLI-скрипти адміністратора - у `/var/www/html/admin/cli`
(поза `public`). `$CFG->dirroot` = `/var/www/html/public`.

**Генератор.** `$gen = \core\test\phpunit\phpunit_util::get_data_generator();` (так само робить
`tool_generator\course_backend::make()`). Працює в CLI при `composer install --no-dev`: класи PHPUnit не потрібні.
Перед генерацією: `\core\session\manager::set_user(get_admin());` - генератори рубрики і SCORM вимагають `$USER`.

**Курс і розділи.** `$gen->create_course(['format' => 'topics', 'numsections' => N, 'lang' => 'uk', ...])`;
назва розділу: `course_update_section($course, get_fast_modinfo($course)->get_section_info($n), ['name' => ...])`.

**Книга.** `$gen->create_module('book', [...])`, далі
`toolbook_importhtml_import_chapters(stored_file $zip, 2, $bookrecord, context_module::instance($cmid), false)`
з `mod/book/tool/importhtml/locallib.php`. Тип `2` - кожен HTML у корені ZIP є главою (тип `1` - глава = каталог).
ZIP має бути `stored_file`, тому спершу кладемо його в чернетку користувача (`spike_file_to_draft()`).
Функція друкує HTML-повідомлення - перехоплюємо `ob_start()`.

**Сторінка, URL.** `create_module('page', ['content' => ..., 'contentformat' => FORMAT_HTML])`,
`create_module('url', ['externalurl' => ..., 'display' => 0])`.

**Глосарій.** `create_module('glossary', [...])`;
записи: `$gen->get_plugin_generator('mod_glossary')->create_content($glossary, ['concept', 'definition', 'definitionformat' => FORMAT_HTML, 'approved' => 1])`.

**Завдання з рубрикою.** `create_module('assign', ['grade' => 3, 'assignsubmission_onlinetext_enabled' => 1])`;
`$gen->get_plugin_generator('gradingform_rubric')->create_instance($ctx, 'mod_assign', 'submissions', $назва, $опис, ['Критерій' => ['Рівень' => бали, ...], ...])`.
Критерії - ключі масиву; дубль назви мовчки перезапише попередній критерій. Рубрика отримує статус 20 (готова).

**Банк питань (5.x).** `core_question\local\bank\question_bank_helper::create_default_open_instance($course, 'Назва', question_bank_helper::TYPE_STANDARD)`
повертає `cm_info` модуля `mod_qbank` (розділ 0, прихований). Категорія за замовчуванням:
`question_get_default_category(context_module::instance($cm->id)->id, true)`.

**Імпорт Moodle XML** (так само, як `question/bank/importquestions/import.php`):

```php
$qformat = new qformat_xml();
$qformat->setCategory($defaultcategory);
$qformat->setContexts([$bankcontext]);
$qformat->setCourse($course);
$qformat->setFilename($path);
$qformat->setRealfilename(basename($path));
$qformat->setMatchgrades('error');     // недопустимий відсоток - помилка, а не округлення
$qformat->setCatfromfile(true);        // категорії з <question type="category">
$qformat->setContextfromfile(false);   // контекст завжди банк
$qformat->setStoponerror(true);
$ok = $qformat->importpreprocess() && $qformat->importprocess() && $qformat->importpostprocess();
```

Тег питання: `core_tag_tag::get_by_name(core_tag_area::get_collection('core_question', 'question'), 'bloom-apply')`.

**Тест із випадковими питаннями.**

```php
$quiz = $gen->create_module('quiz', ['grade' => 6, 'questionsperpage' => 0,
    'preferredbehaviour' => 'deferredfeedback'] + $review);   // $review - див. нижче
$structure = \mod_quiz\structure::create_for_quiz(\mod_quiz\quiz_settings::create($quiz->id));
$structure->add_random_questions($page, $count, ['filter' => [
    'category' => ['jointype' => \core_question\local\bank\condition::JOINTYPE_DEFAULT,
                   'values' => [$categoryid], 'filteroptions' => ['includesubcategories' => false]],
    'qtagids'  => ['jointype' => \qbank_tagquestion\tag_condition::JOINTYPE_DEFAULT, 'values' => [$tagid]],
]]);
$calc = \mod_quiz\quiz_settings::create($quiz->id)->get_grade_calculator();
$calc->recompute_quiz_sumgrades();
$calc->update_quiz_maximum_grade(6);
```

Фіксоване питання: `quiz_add_quiz_question($questionid, $quiz, $page)` (`mod/quiz/locallib.php`).
Для кількох слотів з одним фільтром - `add_random_questions(0, 5, $filter)`.

Параметри перегляду контрольного тесту (поля форми модуля, генератор приймає їх напряму):
`attempt|marks|maxmarks|overallfeedback` + `immediately|open|closed` = 1;
`correctness|specificfeedback|generalfeedback|rightanswer` лише `closed` = 1; усі `...during` = 0, крім `maxmarksduring`.
У БД це `reviewrightanswer = 16` (`display_options::AFTER_CLOSE`), `reviewmarks = 4368`.

**SCORM.** `create_module('scorm', ['packagefile' => $draftitemid, 'grademethod' => GRADEHIGHEST, 'maxgrade' => 100, 'skipview' => 2, 'hidetoc' => 3])`.
Параметр `packagefilepath` генератора приймає лише файли всередині `$CFG->dirroot`, тому ZIP кладемо в чернетку сами.

**Журнал оцінок** (`lib/grade/grade_category.php`, `grade_item.php`):

```php
$top = grade_category::fetch_course_category($courseid);
$top->aggregation = GRADE_AGGREGATE_WEIGHTED_MEAN;     // 10
$top->aggregateonlygraded = 0;                         // порожні оцінки = 0: накопичувальна 100-бальна шкала
$top->update();
$item = $top->load_grade_item(); $item->grademax = 100; $item->update();

$cat = new grade_category(['courseid' => $courseid, 'fullname' => 'Модульні тести',
    'aggregation' => GRADE_AGGREGATE_SUM, 'aggregateonlygraded' => 0], false);
$cat->insert(); $cat->set_parent($top->id);
$ci = $cat->load_grade_item(); $ci->aggregationcoef = 24; $ci->update();   // вага; 0 = поза підсумком
grade_item::fetch(['courseid' => $courseid, 'itemtype' => 'mod', 'itemmodule' => 'quiz',
    'iteminstance' => $quizid, 'itemnumber' => 0])->set_parent($cat->id);
grade_regrade_final_grades($courseid);
```

**Резервна копія.** `php /var/www/html/admin/cli/backup.php --courseshortname=KU-SPIKE --destination=/work/out`.
Параметра «з користувачами» немає: `backup_controller` бере налаштування сайту, тому перед запуском
`php admin/cli/cfg.php --component=backup --name=backup_general_users --set=0` (див. `backup.sh`).

**Мовний пакет.** `(new \tool_langimport\controller())->install_languagepacks('uk')` (завантажує з download.moodle.org).

**Відновлення з CLI** (контроль): `new restore_controller($dir, $courseid, backup::INTERACTIVE_NO, backup::MODE_GENERAL, $userid, backup::TARGET_CURRENT_ADDING)`,
`execute_precheck()`, `execute_plan()` (`spike/restore-cli.php`). CLI не перевіряє `moodle/restore:restorecourse`,
тому права викладача доводили саме веб-відновленням; CLI - лише для контрольних порівнянь.

## Moodle XML: обов'язкові поля і схема банку

Джерело - код `question/format/xml/format.php` і `question/type/*/questiontype.php` 5.2.2, перевірено імпортом
`fixtures/questions.xml` (0 попереджень PHP). Пропуск полів не тестувався окремо, «обов'язкове» тут означає:
імпортер читає поле без значення за замовчуванням або зупиняється з помилкою.

| Тип (`type=`) | Обов'язково | Варто задавати явно (інакше неочевидне умовчання) |
|---|---|---|
| усі | `<name><text>` (без нього імпорт зупиняється), `<questiontext format="html"><text>` | `<idnumber>`, `<defaultgrade>`, `<penalty>`, `<generalfeedback>`, `<tags>` |
| `category` | `<category><text>top/Модуль/Тема</text>` | `<idnumber>`, `<info format="html">` |
| `multichoice` | `<answer fraction="...">` з `<text>` | `<single>` (умовчання true), `<shuffleanswers>` (умовчання **false**), `<answernumbering>`, 3 комбіновані відгуки, `<showstandardinstruction>` |
| `truefalse` | два `<answer>` з текстом `true`/`false` і `fraction` | `<feedback>` |
| `matching` | `<subquestion>` з `<text>` і `<answer><text>` | `<shuffleanswers>`; кількість пар імпорт не перевіряє, у спайку 3 |
| `numerical` | `<answer>` з `<text>` (число з КРАПКОЮ) | `<tolerance>` (умовчання 0), `<showunits>3</showunits>` без одиниць |
| `calculated` | для кожної відповіді `<tolerance>`, `<tolerancetype>` (1 = відносний, 0.01 = ±1%), `<correctanswerformat>`, `<correctanswerlength>`; `<dataset_definitions>` з `status`, `name`, `type`, `distribution`, `minimum`, `maximum`, `decimals`, `itemcount`, `dataset_items` | `<synchronize>`, `<unitgradingtype>` |
| `ddwtos` | `<dragbox><text>` для кожного варіанта, `[[n]]` у тексті | `<group>`, `<shuffleanswers>` |
| `cloze` | валідний Cloze у `questiontext` (`{1:MULTICHOICE:=a~b}`, `{1:NUMERICAL:=10.5:0.05}`, `{1:SHORTANSWER:=...}`) | `<penalty>`; `defaultgrade` рахується з підпитань |

Рекомендації до схеми банку (`content/banks`, експортер `moodle-xml.ts`):

- Числа в XML - завжди з крапкою (`1.5`), кома лише в тексті для студента.
- Відсотки `fraction` - лише з допустимого списку Moodle (100, 50, 33.33333, 25, 20, -50 ...), бо імпорт іде з `matchgrades=error`.
  Для множинного вибору краще 2 або 4 правильні варіанти (50 / 25), штраф за хибні - від'ємний відсоток.
- Категорія - `top/<Модуль>/<Тема>` без `$course$`; `idnumber` у категорій і питань стабільний (реєстр ID); у назвах немає `/`.
- Рівень Блума - окремий тег (`bloom-remember|understand|apply|analyze`); теги норм - окремо, не змішувати.
- `idnumber` унікальний у межах категорії (при відновленні дубль мовчки обнуляється).
- Тип Cloze у файлі - `cloze` (у БД - `multianswer`); невалідний Cloze імпортер відхиляє (`qtype_multianswer_validate_question`).
- Явно задавати `shuffleanswers`, `single`, `showstandardinstruction`, `answernumbering`.

## Підводні камені

1. **Образ без `vendor/`.** `erseco/alpine-moodle:v5.2.2` виконує `composer install` при кожному старті контейнера й
   тягне ~48 пакетів з api.github.com; без токена це падало з HTTP 504, а git в образі немає. Рішення -
   `docker/Dockerfile` вшиває залежності один раз.
2. **Нескінченний редирект на інших портах.** nginx в образі слухає 8080, а Moodle порівнює порт запиту з портом
   `wwwroot`. У `compose.yaml` nginx переналаштовано слухати опублікований порт (`PRE_CONFIGURE_COMMANDS`).
3. **Глосарій = дані користувачів.** Записи потрапляють у копію лише з `users=1`; викладач не має
   `moodle/restore:userinfo`, тож і з такої копії записів не отримає (перевірено). Відновлює їх лише адміністратор
   (контроль: 2 записи). До того ж копія з користувачами містить `users.xml` з e-mail автора. Рішення: `.mbz` без
   користувачів + окремий `glossary-entries.xml`, який викладач імпортує в «Імпорт записів» (категорії теж).
4. **Банк питань 5.x.** Питання живуть у модулі `mod_qbank` (контекст модуля), а не в курсі. Шлях категорії у XML -
   від `top` без `$course$`; якщо в XML контекст курсу і `contextfromfile=true`, Moodle сам створить «системний» банк.
   Банк прихований від студентів і відновлюється як звичайний модуль.
5. **Відновлення асинхронне.** У 5.2 `enableasyncbackup = 1`: після «Виконати відновлення» створюється adhoc-завдання, яке
   виконує cron. Без cron на eln курс не з'явиться. Локально - ~6 с.
6. **Журнал оцінок відновлюється, лише якщо** в курсі-цілі немає власних категорій оцінок і на кроці «Схема» не знято
   жодної діяльності (`restore_gradebook_structure_step::execute_condition`). Тому - порожній курс і нічого не знімати.
7. **Викладач бачить лише «Відновити в цей курс»** (злиття або заміну вмісту); нового курсу створити не може.
   У режимі злиття назви розділів приходять з копії, а назва й налаштування курсу-цілі лишаються.
8. **Кома в числових.** Працює завдяки `decsep` мовного пакета uk. Студент з інтерфейсом en отримає «1,5» = 15 і
   попередження. У спайку і студент, і курс-ціль мають мову `uk`. При злитті налаштування курсу з копії не
   переносяться, тож на eln мову курсу («Примусова мова») задає викладач або адміністратор.
9. **SVG.** `pluginfile.php` віддає SVG з `Content-Disposition: attachment` (захист від XSS): у `<img>` вони
   відображаються, але пряме посилання на SVG завантажує файл. Шрифти сторінки всередині SVG у `<img>` недоступні
   (на скріншоті - засічковий запасний шрифт): задавати `font-family` системними шрифтами або переводити текст у криві.
10. **Імпорт глав Книги.** Назва глави береться з `<title>`, а Книга сама додає нумерацію («1. 1. ...») і виводить назву
    над текстом (заголовок у `<body>` дублюється): у `<title>` без номера, у тілі без `h1/h2` з назвою. Файли й
    посилання між главами переписуються лише для атрибутів у подвійних лапках. `<style>` з `<head>` копіюється в главу.
11. **Правильні відповіді «після закриття»** з'являються лише якщо в тесту задано дату закриття; без неї - ніколи.
12. **Сторінка входу 5.2 у Playwright.** Відправка форми до завершення фонових запитів дає «Unable to log in»
    (logintoken не збігається із сесією): чекати `networkidle`. Filepicker перемальовує форму асинхронно - перед
    `setInputFiles` чекати форму, інакше «Файли не долучено».
13. **Назва файлу копії локалізована** (`резервна_копія-moodle2-course-...-nu.mbz`); `backup.sh` перейменовує.
14. **Автоматичний форум «Announcements»** з'являється в порожньому курсі при першому відкритті - це не частина копії.

## Знайдені дефекти відновлення в Moodle 5.2.2

Під час спайку двічі отримано пошкоджений банк питань після відновлення, хоча сама копія була правильною.
Обидва випадки - змішування СТАРИХ id з копії з НОВИМИ id сайту-цілі, коли їх діапазони перетинаються
(типово - два свіжі сайти, як build і verify). Докази - `out/evidence/` (локально, у `.gitignore`).

1. **Тег питання переїжджає на інше питання.** `restore_activity_structure_step::after_restore()`
   (`public/backup/moodle2/restore_stepslib.php`) виконує
   `set_field('tag_instance', 'itemid', $newinstance, ['contextid' => $ctx, 'itemid' => $oldinstance])` без фільтра
   `component`. Для модуля `mod_qbank` зі старим instance id 3 тег питання з новим id 3 у тому самому контексті
   перезаписався на питання 1: слот «understand» почав видавати питання рівня remember, а Q03 не випадало ніколи
   (`run0-question-tag-moved.txt`).
2. **Категорії банку опиняються в контексті тесту.** `restore_move_module_questions_categories` перезаписує
   `parentitemid` категорій новим id контексту банку (21), а далі в тому ж циклі шукає категорії за старими id
   контекстів; старий контекст «Підсумкового тесту» теж мав id 21, тож усі категорії банку переїхали в модуль тесту
   (банк порожній, дерево категорій зламане; `run1-qcategories-in-wrong-context.txt`, `run1-verify-summary.txt`).
3. **З коду, не відтворено:** `process_tag()` записує відповідність id тегу лише якщо новий id != старому, а
   `tag_condition::restore_filtercondition()` без відповідності мовчки видаляє фільтр тегу з випадкового слота.

**Обхід (впроваджено й перевірено):** перед збиранням `spike_raise_id_sequences()` (`spike/lib/ids.php`) піднімає всі
послідовності id сайту build до 900 000 000. Старі id у `.mbz` стають більшими за будь-які нові id реального сайту,
перетин неможливий. Після цього прогін від нуля проходить повністю, теги й категорії на місці. На eln з великими id
перетин і без обходу малоймовірний, але обхід нічого не коштує і робить перевірку у verify чесною.
Відтворити дефекти: `SPIKE_NO_ID_FLOOR=1 ./verify.sh` (очікувано - падіння перевірки банку).
Звернення в трекер Moodle не створювалось.

## Що не перевірено або не працює

- Відновлення на самому eln (права ролей там можуть бути змінені, розмір завантаження, cron) - не перевірялось.
- Режим «Вилучити вміст курсу, а потім відновити» (ризик втратити власне зарахування) - не перевірявся; інструкція радить злиття.
- Оцінювання роботи за рубрикою й подання завдань - не перевірялось (перевірено лише відновлення визначення рубрики).
- Тест із 15 випадковими питаннями і балансом 5/5/4/1 - не перевірявся (у спайку 4 слоти по одному).
- Імпорт глав Книги типу «каталог на главу» (тип 1), великі SCORM і PDF, ліміти розміру `.mbz` - не перевірялись.
- Дефект 3 вище - лише аналіз коду.
- Статистика тесту, бейджі, виконання курсу (completion) - поза спайком.

## Експортер tools/export: рішення й перевірка імпорту

`tools/export/*.ts` генерує Moodle XML з банків і глосарію (`npm run export:moodle`), а
`./import-check.sh` доводить імпорт у живому Moodle 5.2.2 (`npm run moodle:import-check`;
звіт — `out/import-check.json`, тестові курси `KU-IMPORT-*` після перевірки видаляються).
Нижче — те, що з'ясувалося вже після спайку.

**Пробіл біля сутності зникає поза CDATA.** `core\xml_parser::characterdata()` відкидає шматки тексту,
які складаються лише з пробілів (`trim($data) != ''`), а PHP-парсер віддає текст порціями на межах
посилань на сутності. Тому назва `Альфа &amp; Бета` після імпорту стає `Альфа &Бета` — пробіл після
`&amp;` губиться (відтворено на `<name><text>`). У CDATA сутностей немає, тож проблема не виникає.
**Правило експортера:** будь-який вільний текст (`<name>`, `<category>`, відповіді `matching` і
`ddwtos`, `CONCEPT`, `DEFINITION`, `NAME` глосарію) виводиться в `<![CDATA[…]]>`; звичайним текстом
лишаються тільки числа, коди й теги. `]]>` усередині тексту розривається на дві секції CDATA.

**Назва питання проходить `PARAM_TEXT`.** `qformat_xml::clean_question_name()` викликає `strip_tags`,
тому `<` у назві з'їдає частину тексту. Експортер кодує в назві `<` і `>` як `&lt;`/`&gt;` (Moodle
показує назву через `format_string`, тож студент і викладач бачать правильні символи).

**Види банків розділені деревом категорій.** Тренувальні питання йдуть у
`top/Тренувальний банк/Модуль N. …/Тема NN. …` (idnumber `tr`, `tr-mN`, `tr-tNN`), контрольні — у
`top/Контрольний банк/…` (`ct`, `ct-mN`, `ct-tNN`). ID питань за схемою банку різні за видом:
тренувальні `tNN-qNNN`, контрольні `tNN-kNNN`. Перевірено на змішаному сценарії `import-check`:
обидва файли імпортовано в один банк одного курсу, і випадковий слот тесту з фільтром
«категорія теми + тег `bloom-*`» бере лише питання свого виду (пул і 10 жеребкувань).

**Відгуки, яких немає в типі Moodle.** У `matching` немає відгуку на пару, у `ddwtos` — на варіант,
тому експортер дописує їх до `<generalfeedback>` списком `<ul><li>варіант — пояснення</li></ul>`.
Норми з `lawRef` теж ідуть у `<generalfeedback>` окремими рядками
(`<p>Норма: ст. 40 ч. 1 Закону № 2465-IX (перевірено 15.09.2026)</p>`, з посиланням, якщо задано `url`),
а не тегами: теги Moodle короткі й призначені для фільтрів (`bloom-*`, `topic-tNN`).

**Cloze SHORTANSWER і апостроф.** Moodle порівнює коротку відповідь буквально (NFC, обрізані краї,
`*` — шаблон). Експортер виводить варіанти з усіма апострофами (’, ', ʼ), екранує `*` і не ставить
нерозривних пробілів; очікувана поведінка рушія сайту — так само нормалізувати апостроф і регістр,
щоб оцінка на сайті й у Moodle збігалася.

**Набори даних `calculated`.** Moodle під час імпорту нічого не генерує, а бере значення з файлу,
тож експортер вивантажує саме той набір, який дає рушій тесту (`generateDatasetItems`,
`src/engines/quiz`) — інакше варіанти задачі на сайті й у Moodle були б різні.

## Час і розміри

| Етап | Значення (прогін 2026-09-15, Apple Silicon, Docker 29) |
|---|---|
| Інсталяція двох інстансів + мовний пакет | 78 с (плюс одноразове збирання образу) |
| `build-spike.php` | 1,6 с |
| `backup.php` | 2-4 с на копію |
| `.mbz` без користувачів / з користувачами | 27 566 / 28 607 байт |
| Відновлення викладачем (асинхронне) | ~6 с від «Виконати відновлення» |
| Playwright, 9 перевірок | 1,7 хв |
| `verify.sh` від нуля | 200 с |

## Каркас фінального build-course.php

Спайкові модулі `spike/lib/*.php` - основа; фінальний скрипт лише читає згенеровані експортерами файли.

```text
tools/moodle/build-course.php --manifest=/work/dist/moodle/course.json --variant=public|control
  0. require config.php; set_user(admin); get_data_generator(); збирати PHP-попередження у звіт
  1. spike_raise_id_sequences()                         // обов'язково до створення будь-чого
  2. видалити курс з тим самим shortname; create_course(lang=uk, format=topics, numsections=4)
  3. для кожного модуля М1-М4: course_update_section(назва, опис)
     3.1 для кожної теми: Книга <- toolbook_importhtml_import_chapters(book-mNN-tNN.zip, 2)
     3.2 Сторінки (силабус, політика), URL на сайт і PDF
     3.3 практичні: assign(grade=3) + gradingform_rubric (унікальні назви критеріїв)
     3.4 SCORM-тренажери (packagefile з чернетки), grademethod=GRADEHIGHEST
  4. Глосарій без записів (записи - окремий glossary.xml для імпорту викладачем)
  5. банк: create_default_open_instance(TYPE_STANDARD) -> qformat_xml (catfromfile, matchgrades=error)
     перевірка: кількість питань за idnumber і теги кожного питання = маніфест
  6. модульні тести: grade=6, для кожного рівня Блума add_random_questions(0, n, {category теми/модуля, qtagids})
     підсумковий тест: grade=40, матриця «теми x рівні» -> слоти; review: rightanswer лише AFTER_CLOSE, timeclose задати
  7. журнал: WEIGHTED_MEAN, aggregateonlygraded=0, max 100; категорії 24/24/12/40 (SUM), «Тренажери» вага 0
  8. rebuild_course_cache; звіт JSON (id, кількості, теги, фільтри, час)
backup.sh <shortname> 0 <назва>.mbz; verify.sh: відновлення викладачем + ті самі перевірки Playwright
```

Публічний і контрольний варіанти відрізняються лише банком питань і тестами; `.mbz` завжди без користувачів.

## Інструкція для викладача eln

Потрібна роль «Викладач» з правом редагування в курсі (слухач відновлювати не може).

**Відновлення курсу**

1. Попросіть адміністратора створити **порожній** курс і зарахувати вас викладачем. Не створюйте в ньому категорій
   журналу оцінок і діяльностей.
2. Відкрийте курс -> **Більше** -> **Повторне використання курсу** -> у списку сторінки оберіть **Відновити**.
3. У полі «Файл резервного копіювання» натисніть **Виберіть файл...** -> **Завантажити файл** -> оберіть `.mbz` ->
   **Завантажити цей файл** -> **Відновлення**.
4. Крок «1. Підтвердити»: перевірте, що це курс «Корпоративне управління», -> **Продовжити**.
5. Крок «2. Призначення», блок «Відновити в цей курс»: оберіть **Злити резервну копію з цим курсом** -> **Продовжити**.
6. Крок «3. Налаштування»: нічого не змінюйте -> **Далі**. Червоний хрестик із замком біля «Включити зареєстрованих
   користувачів» - це нормально.
7. Крок «4. Схема»: **не знімайте жодної позначки** (інакше не відновиться журнал оцінок) -> **Далі**.
8. Крок «5. Огляд» -> **Виконати відновлення**. Відновлення йде у фоні; зачекайте кілька хвилин і відкрийте курс.
9. Перевірте: 4 модулі-розділи; Книги відкриваються і схеми видно; **Журнал оцінок -> Налаштування журналу оцінок**
   показує значимість 24 / 24 / 12 / 40 і 0 для тренажерів; у тестах задані дати закриття.

**Імпорт термінів глосарію**

1. Відкрийте «Глосарій» курсу (після відновлення він порожній - так і має бути).
2. **Більше** (або меню дій глосарію) -> **Імпорт записів**.
3. «Файл для імпорту»: **Виберіть файл...** -> **Завантажити файл** -> `glossary.xml` -> **Завантажити цей файл**.
4. «Призначення імпортованих записів»: **Поточний глосарій**; позначте **Імпортувати категорії** -> **Відправити**.
5. На сторінці результату «Всього записів» має дорівнювати «Імпортовані записи».

Якщо відновлення недоступне (немає прав або завеликий файл) - запасні шляхи: імпорт питань Moodle XML у банк,
ZIP глав у Книгу, SCORM-пакети окремо.
