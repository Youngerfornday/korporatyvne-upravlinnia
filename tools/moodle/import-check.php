<?php
// Перевірка реального імпорту Moodle XML, згенерованого tools/export/cli.ts, в інстансі build.
// Запуск у контейнері (import-check.sh копіює файл у /tmp):
//   php /tmp/ku-import-check.php --manifest=/work/out/import-check/manifest.json --out=/work/out/import-check.json
//
// Для кожного файлу питань із маніфесту: новий курс -> банк mod_qbank -> qformat_xml з налаштуваннями спайку
// (matchgrades=error, catfromfile=true, contextfromfile=false, stoponerror) -> звірка з маніфестом: кількість
// за типами, idnumber, категорія, шлях і батько категорії, теги, бал; потім кожне питання проходить спробу
// з правильною відповіддю (get_correct_response) і має отримати повний бал.
// Для кожного файлу глосарію: новий курс -> глосарій -> імпорт записів тією самою логікою, що
// mod/glossary/import.php (поточний глосарій, «Імпортувати категорії») -> звірка записів, синонімів, категорій.
// Якщо в маніфесті є курсові файли обох видів (тренувальний і контрольний), окремо перевіряється змішаний
// сценарій: обидва імпортуються в ОДИН банк одного курсу, і випадковий слот тесту з фільтром «категорія + тег»
// має брати питання лише свого виду.
// Код виходу 1, якщо є хоч одна помилка (включно з попередженнями PHP).

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/mod/glossary/lib.php');
require_once($CFG->dirroot . '/question/engine/lib.php');
require_once('/work/spike/lib/util.php');
require_once('/work/spike/lib/questions.php');

[$options, $unrecognised] = cli_get_params(
    ['manifest' => '', 'out' => '', 'prefix' => 'KU-IMPORT', 'cleanup' => false, 'help' => false],
    ['h' => 'help']
);
if ($unrecognised) {
    cli_error('Unknown options: ' . implode(', ', $unrecognised));
}
if ($options['help'] || $options['manifest'] === '') {
    cli_writeln('php import-check.php --manifest=<manifest.json> [--out=<report.json>] [--prefix=KU-IMPORT] [--cleanup]');
    cli_writeln('--cleanup  видалити створені тестові курси після перевірки');
    exit($options['help'] ? 0 : 2);
}

$phpwarnings = [];
set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline) use (&$phpwarnings) {
    $phpwarnings[] = sprintf('%d: %s at %s:%d', $errno, $errstr, str_replace('/var/www/html/', '', $errfile), $errline);
    return true;
});

\core_php_time_limit::raise();
raise_memory_limit(MEMORY_HUGE);
\core\session\manager::set_user(get_admin());

/**
 * Створює порожній курс, попередньо видаливши курс із тим самим shortname.
 */
function ku_delete_course(string $shortname): void {
    global $DB;
    if ($existing = $DB->get_record('course', ['shortname' => $shortname])) {
        spike_capture_output(fn() => delete_course($existing, false));
    }
}

function ku_fresh_course(testing_data_generator $gen, string $shortname): stdClass {
    ku_delete_course($shortname);
    return $gen->create_course(['shortname' => $shortname, 'fullname' => $shortname, 'lang' => 'uk']);
}

/**
 * Шлях категорії від top у форматі Moodle XML (буквальна «/» у назві подвоюється).
 */
function ku_category_path(stdClass $category): string {
    global $DB;
    $names = [];
    for ($current = $category; $current; $current = $current->parent ? $DB->get_record('question_categories', ['id' => $current->parent]) : null) {
        array_unshift($names, str_replace('/', '//', $current->name));
    }
    return implode('/', $names);
}

/**
 * Проходить питання з правильною відповіддю в тимчасовій спробі (без збереження) і повертає отриману частку.
 */
function ku_fraction_for_correct_response(int $questionid, context $context): ?float {
    $quba = question_engine::make_questions_usage_by_activity('core_question_preview', $context);
    $quba->set_preferred_behaviour('deferredfeedback');
    $slot = $quba->add_question(question_bank::load_question($questionid), 1);
    $quba->start_question($slot, 1);
    $quba->process_action($slot, $quba->get_question($slot)->get_correct_response());
    $quba->finish_all_questions();
    $fraction = $quba->get_question_fraction($slot);
    return $fraction === null ? null : (float)$fraction;
}

function ku_sorted(array $values): array {
    sort($values);
    return array_values($values);
}

function ku_check_categories(stdClass $bank, array $expected): array {
    global $DB;
    $errors = [];
    $top = question_get_top_category($bank->contextid, true);
    $found = [];
    foreach ($expected as $category) {
        $record = $DB->get_record('question_categories', ['contextid' => $bank->contextid, 'idnumber' => $category['idnumber']]);
        if (!$record) {
            $errors[] = "category {$category['idnumber']}: not found";
            continue;
        }
        $found[$category['idnumber']] = $record;
        $path = ku_category_path($record);
        if ($path !== $category['path']) {
            $errors[] = "category {$category['idnumber']}: path '{$path}' != '{$category['path']}'";
        }
        $parent = $DB->get_record('question_categories', ['id' => $record->parent]);
        $parentidnumber = ($parent && (int)$parent->id !== (int)$top->id) ? $parent->idnumber : null;
        if ($parentidnumber !== $category['parent']) {
            $errors[] = "category {$category['idnumber']}: parent " . var_export($parentidnumber, true) . ' != ' . var_export($category['parent'], true);
        }
    }
    // Крім top і категорії банку за замовчуванням, у контексті не має бути інших категорій.
    $default = question_get_default_category($bank->contextid);
    $extra = $DB->get_records_select('question_categories', 'contextid = ? AND id <> ? AND id <> ?',
        [$bank->contextid, $top->id, $default->id]);
    foreach ($extra as $record) {
        if (!array_key_exists((string)$record->idnumber, $found)) {
            $errors[] = "unexpected category '{$record->name}' (idnumber '{$record->idnumber}')";
        }
    }
    return [$errors, count($found)];
}

function ku_check_question_file(testing_data_generator $gen, string $dir, array $expected, string $prefix): array {
    global $DB;
    $shortname = strtoupper("{$prefix}-Q-{$expected['kind']}-{$expected['scope']}");
    $result = ['file' => $expected['file'], 'course' => $shortname, 'expected' => ['total' => $expected['total'],
        'bytype' => $expected['byType'], 'categories' => count($expected['categories'])], 'errors' => []];
    $course = ku_fresh_course($gen, $shortname);
    $bank = spike_create_question_bank($course);
    try {
        $import = spike_import_questions($course, $bank, $dir . '/' . $expected['file']);
    } catch (Throwable $e) {
        $result['errors'][] = 'import failed: ' . $e->getMessage();
        return $result;
    }
    $questions = array_values($import['questions']);
    $bytype = [];
    foreach ($questions as $question) {
        $bytype[$question->qtype] = ($bytype[$question->qtype] ?? 0) + 1;
    }
    ksort($bytype);
    [$categoryerrors, $categoriesfound] = ku_check_categories($bank, $expected['categories']);
    $result['imported'] = ['total' => count($questions), 'bytype' => $bytype, 'categories' => $categoriesfound];
    $result['errors'] = array_merge($result['errors'], $categoryerrors);
    if (count($questions) !== $expected['total']) {
        $result['errors'][] = 'question count ' . count($questions) . " != {$expected['total']}";
    }
    if ($bytype != $expected['byType']) {
        $result['errors'][] = 'types ' . json_encode($bytype) . ' != ' . json_encode($expected['byType']);
    }

    $byidnumber = [];
    foreach ($questions as $question) {
        $byidnumber[(string)$question->idnumber] = $question;
    }
    $context = context::instance_by_id($bank->contextid);
    $tagged = 0;
    $fullmarks = 0;
    foreach ($expected['questions'] as $want) {
        $id = $want['idnumber'];
        $got = $byidnumber[$id] ?? null;
        if (!$got) {
            $result['errors'][] = "{$id}: not imported (or idnumber lost)";
            continue;
        }
        if ($got->qtype !== $want['qtype']) {
            $result['errors'][] = "{$id}: qtype {$got->qtype} != {$want['qtype']}";
        }
        if ($got->categoryidnumber !== $want['category']) {
            $result['errors'][] = "{$id}: category {$got->categoryidnumber} != {$want['category']}";
        }
        $tags = ku_sorted(array_values(core_tag_tag::get_item_tags_array('core_question', 'question', $got->id)));
        if ($tags === ku_sorted($want['tags'])) {
            $tagged++;
        } else {
            $result['errors'][] = "{$id}: tags " . json_encode($tags) . ' != ' . json_encode($want['tags']);
        }
        $defaultmark = (float)$DB->get_field('question', 'defaultmark', ['id' => $got->id]);
        if (abs($defaultmark - (float)$want['defaultMark']) > 1e-7) {
            $result['errors'][] = "{$id}: defaultmark {$defaultmark} != {$want['defaultMark']}";
        }
        try {
            $fraction = ku_fraction_for_correct_response((int)$got->id, $context);
            if ($fraction !== null && abs($fraction - 1.0) < 1e-6) {
                $fullmarks++;
            } else {
                $result['errors'][] = "{$id}: correct response graded " . var_export($fraction, true);
            }
        } catch (Throwable $e) {
            $result['errors'][] = "{$id}: attempt failed: " . $e->getMessage();
        }
    }
    $result['imported']['tagsmatched'] = $tagged;
    $result['imported']['fullmarksforcorrectresponse'] = $fullmarks;
    $result['importlog'] = mb_substr($import['log'], 0, 400);
    return $result;
}

/**
 * Ідентифікатори питань пулу, який дасть фільтр випадкового слота (той самий random_question_loader,
 * що використовує mod_quiz під час спроби).
 */
function ku_pool_idnumbers(array $filter, int $limit = 200): array {
    global $DB;
    $loader = new \core_question\local\bank\random_question_loader(new qubaid_list([]));
    $questions = $loader->get_filtered_questions($filter, $limit, 0, ['q.id']);
    if (!$questions) {
        return [];
    }
    [$insql, $params] = $DB->get_in_or_equal(array_keys($questions));
    $sql = "SELECT q.id, qbe.idnumber
              FROM {question} q
              JOIN {question_versions} qv ON qv.questionid = q.id
              JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
             WHERE q.id $insql";
    return ku_sorted(array_map(fn($r) => (string)$r->idnumber, $DB->get_records_sql($sql, $params)));
}

/**
 * Кілька послідовних жеребкувань тим самим фільтром: так само добирає питання спроба тесту.
 */
function ku_draw_idnumbers(array $filter, int $draws): array {
    global $DB;
    $loader = new \core_question\local\bank\random_question_loader(new qubaid_list([]));
    $result = [];
    for ($i = 0; $i < $draws; $i++) {
        $questionid = $loader->get_next_filtered_question_id($filter);
        if ($questionid === null) {
            break;
        }
        $result[] = (string)$DB->get_field_sql(
            "SELECT qbe.idnumber FROM {question_versions} qv
               JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
              WHERE qv.questionid = ?", [$questionid]);
    }
    return $result;
}

/**
 * Змішаний сценарій: обидва види банків в одному курсі. Доводить, що випадковий слот із фільтром
 * «категорія теми + тег Блума» бере лише питання свого виду (idnumber tNN-qNNN проти tNN-kNNN).
 */
function ku_check_mixed_bank(testing_data_generator $gen, string $dir, array $manifest, string $prefix): ?array {
    $files = array_values(array_filter($manifest['questions'], fn($file) => $file['scope'] === 'course'));
    $kinds = array_unique(array_map(fn($file) => $file['kind'], $files));
    if (count($kinds) < 2) {
        return null;
    }
    $shortname = strtoupper("{$prefix}-MIX");
    $result = ['course' => $shortname, 'files' => array_map(fn($file) => $file['file'], $files), 'errors' => []];
    $course = ku_fresh_course($gen, $shortname);
    $bank = spike_create_question_bank($course);

    $expected = [];
    foreach ($files as $file) {
        try {
            $import = spike_import_questions($course, $bank, $dir . '/' . $file['file']);
        } catch (Throwable $e) {
            $result['errors'][] = "{$file['file']}: import failed: " . $e->getMessage();
            return $result;
        }
        $expected[$file['kind']] = $file;
    }
    // Після другого імпорту в банку мають лежати питання обох видів.
    $total = array_sum(array_map(fn($file) => $file['total'], $files));
    $result['questionsinbank'] = ku_count_bank_questions($bank);
    if ($result['questionsinbank'] !== $total) {
        $result['errors'][] = "questions in shared bank {$result['questionsinbank']} != {$total}";
    }

    foreach ($expected as $kind => $file) {
        [$categoryidnumber, $tag, $wanted] = ku_pick_probe($file);
        if ($tag === null) {
            $result['errors'][] = "{$kind}: у маніфесті немає питань з тегом bloom-*";
            continue;
        }
        $topic = explode('-', $categoryidnumber, 2)[1] ?? $categoryidnumber;
        $otherkind = $kind === 'training' ? 'control' : 'training';
        $sameTopicOtherKind = isset($expected[$otherkind])
            ? ku_sorted(array_values(array_map(fn($q) => $q['idnumber'], array_filter(
                $expected[$otherkind]['questions'],
                fn($q) => str_ends_with($q['category'], $topic) && in_array($tag, $q['tags'], true)
            ))))
            : [];

        $category = spike_category_by_idnumber($bank, $categoryidnumber);
        $quiz = spike_create_quiz($gen, $course, 0, "Тест ({$kind})", 6);
        spike_add_random_slots($quiz, $category, [$tag]);
        $filter = spike_random_slot_filters($quiz->cmid)[0] ?? [];
        $pool = ku_pool_idnumbers($filter);
        $draws = ku_draw_idnumbers($filter, 10);
        $foreign = array_values(array_unique(array_filter(array_merge($pool, $draws),
            fn($idnumber) => !in_array($idnumber, $wanted, true))));
        $result['filters'][$kind] = ['category' => $categoryidnumber, 'tag' => $tag, 'expected' => $wanted,
            'pool' => $pool, 'draws' => $draws, 'sametopicotherkind' => $sameTopicOtherKind];
        if ($pool !== $wanted) {
            $result['errors'][] = "{$kind}: пул фільтра " . json_encode($pool) . ' != ' . json_encode($wanted);
        }
        if (!$draws) {
            $result['errors'][] = "{$kind}: випадковий слот не дав жодного питання";
        }
        if ($foreign) {
            $result['errors'][] = "{$kind}: у вибірку потрапили чужі питання " . json_encode(array_values($foreign));
        }
        if (!$sameTopicOtherKind) {
            $result['errors'][] = "{$kind}: у другого виду немає питань тієї самої теми й тегу — перевірка нічого не доводить";
        }
    }
    return $result;
}

/**
 * Пара «категорія + тег Блума» з найбільшою кількістю питань у файлі та перелік її питань.
 *
 * @return array [idnumber категорії, назва тега або null, відсортовані idnumber питань]
 */
function ku_pick_probe(array $file): array {
    $groups = [];
    foreach ($file['questions'] as $question) {
        foreach ($question['tags'] as $tag) {
            if (str_starts_with($tag, 'bloom-')) {
                $groups["{$question['category']}|{$tag}"][] = $question['idnumber'];
            }
        }
    }
    if (!$groups) {
        return ['', null, []];
    }
    uasort($groups, fn($a, $b) => count($b) <=> count($a));
    $key = array_key_first($groups);
    [$category, $tag] = explode('|', $key, 2);
    return [$category, $tag, ku_sorted($groups[$key])];
}

/** Кількість питань (без підпитань Cloze) у банку курсу. */
function ku_count_bank_questions(stdClass $bank): int {
    global $DB;
    return (int)$DB->count_records_sql(
        "SELECT COUNT(1) FROM {question} q
           JOIN {question_versions} qv ON qv.questionid = q.id
           JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
           JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
          WHERE qc.contextid = ? AND q.parent = 0", [$bank->contextid]);
}

/**
 * Імпорт записів у поточний глосарій з категоріями: той самий цикл, що в mod/glossary/import.php (Moodle 5.2.2),
 * без форми завантаження. Повертає [імпортовано, відхилено, створено категорій].
 */
function ku_import_glossary_entries(stdClass $glossary, context $context, string $content): array {
    global $DB, $USER;
    $xml = glossary_read_imported_file($content);
    if (!$xml) {
        throw new moodle_exception('errorparsingxml', 'glossary');
    }
    $imported = 0;
    $rejected = 0;
    $categories = 0;
    $xmlentries = $xml['GLOSSARY']['#']['INFO'][0]['#']['ENTRIES'][0]['#']['ENTRY'] ?? [];
    foreach ($xmlentries as $xmlentry) {
        $entry = new stdClass();
        $entry->concept = trim($xmlentry['#']['CONCEPT'][0]['#']);
        $definition = $xmlentry['#']['DEFINITION'][0]['#'];
        if (!is_string($definition)) {
            throw new moodle_exception('errorparsingxml', 'glossary');
        }
        $entry->definition = trusttext_strip($definition);
        $entry->casesensitive = $xmlentry['#']['CASESENSITIVE'][0]['#'] ?? 0;
        $duplicate = $DB->record_exists_select('glossary_entries', 'glossaryid = :glossaryid AND LOWER(concept) = :concept',
            ['glossaryid' => $glossary->id, 'concept' => core_text::strtolower($entry->concept)]);
        if (!$entry->concept || !$entry->definition || (!$glossary->allowduplicatedentries && $duplicate)) {
            $rejected++;
            continue;
        }
        $entry->glossaryid = $glossary->id;
        $entry->sourceglossaryid = 0;
        $entry->approved = 1;
        $entry->userid = $USER->id;
        $entry->teacherentry = 1;
        $entry->definitionformat = $xmlentry['#']['FORMAT'][0]['#'];
        $entry->timecreated = time();
        $entry->timemodified = time();
        $entry->usedynalink = $xmlentry['#']['USEDYNALINK'][0]['#'] ?? 0;
        $entry->fullmatch = $xmlentry['#']['FULLMATCH'][0]['#'] ?? 1;
        $entry->id = $DB->insert_record('glossary_entries', $entry);
        $imported++;
        foreach ($xmlentry['#']['ALIASES'][0]['#']['ALIAS'] ?? [] as $xmlalias) {
            $aliasname = $xmlalias['#']['NAME'][0]['#'];
            if (!empty($aliasname)) {
                $DB->insert_record('glossary_alias', ['entryid' => $entry->id, 'alias' => trim($aliasname)]);
            }
        }
        foreach ($xmlentry['#']['CATEGORIES'][0]['#']['CATEGORY'] ?? [] as $xmlcat) {
            $name = $xmlcat['#']['NAME'][0]['#'];
            $category = $DB->get_record('glossary_categories', ['glossaryid' => $glossary->id, 'name' => $name]);
            if (!$category) {
                $category = (object)['name' => $name, 'glossaryid' => $glossary->id];
                $category->id = $DB->insert_record('glossary_categories', $category);
                $categories++;
            }
            $DB->insert_record('glossary_entries_categories', ['entryid' => $entry->id, 'categoryid' => $category->id]);
        }
    }
    \mod_glossary\local\concept_cache::reset_glossary($glossary);
    return [$imported, $rejected, $categories];
}

function ku_check_glossary_file(testing_data_generator $gen, string $dir, array $expected, string $prefix): array {
    global $DB;
    $shortname = strtoupper("{$prefix}-G-{$expected['scope']}");
    $result = ['file' => $expected['file'], 'course' => $shortname,
        'expected' => ['total' => $expected['total'], 'categories' => count($expected['categories'])], 'errors' => []];
    $course = ku_fresh_course($gen, $shortname);
    $module = $gen->create_module('glossary', ['course' => $course->id, 'name' => 'Глосарій (перевірка імпорту)',
        'allowduplicatedentries' => 0, 'displayformat' => 'dictionary']);
    $glossary = $DB->get_record('glossary', ['id' => $module->id], '*', MUST_EXIST);
    try {
        [$imported, $rejected, $categories] = ku_import_glossary_entries($glossary, context_module::instance($module->cmid),
            file_get_contents($dir . '/' . $expected['file']));
    } catch (Throwable $e) {
        $result['errors'][] = 'import failed: ' . $e->getMessage();
        return $result;
    }
    $result['imported'] = ['total' => $imported, 'rejected' => $rejected, 'categories' => $categories];
    if ($imported !== $expected['total'] || $rejected !== 0) {
        $result['errors'][] = "entries imported {$imported}, rejected {$rejected}, expected {$expected['total']}";
    }
    if ($categories !== count($expected['categories'])) {
        $result['errors'][] = "categories {$categories} != " . count($expected['categories']);
    }
    $aliasesmatched = 0;
    foreach ($expected['entries'] as $want) {
        $entry = $DB->get_record('glossary_entries', ['glossaryid' => $glossary->id, 'concept' => $want['concept']]);
        if (!$entry) {
            $result['errors'][] = "entry '{$want['concept']}': not found";
            continue;
        }
        $aliases = ku_sorted($DB->get_fieldset('glossary_alias', 'alias', ['entryid' => $entry->id]));
        if ($aliases === ku_sorted($want['aliases'])) {
            $aliasesmatched++;
        } else {
            $result['errors'][] = "entry '{$want['concept']}': aliases " . json_encode($aliases, JSON_UNESCAPED_UNICODE);
        }
        $cats = ku_sorted($DB->get_fieldset_sql('SELECT c.name FROM {glossary_categories} c
            JOIN {glossary_entries_categories} ec ON ec.categoryid = c.id WHERE ec.entryid = ?', [$entry->id]));
        if ($cats !== ku_sorted($want['categories'])) {
            $result['errors'][] = "entry '{$want['concept']}': categories " . json_encode($cats, JSON_UNESCAPED_UNICODE);
        }
    }
    $result['imported']['aliasesmatched'] = $aliasesmatched;
    return $result;
}

$started = microtime(true);
$manifestpath = $options['manifest'];
$manifest = json_decode((string)file_get_contents($manifestpath), true, 512, JSON_THROW_ON_ERROR);
$dir = dirname($manifestpath);
$gen = \core\test\phpunit\phpunit_util::get_data_generator();

$report = ['moodle' => $CFG->release, 'manifest' => basename($manifestpath), 'questionfiles' => [], 'glossaryfiles' => []];
foreach ($manifest['questions'] as $expected) {
    $report['questionfiles'][] = ku_check_question_file($gen, $dir, $expected, $options['prefix']);
}
foreach ($manifest['glossaries'] as $expected) {
    $report['glossaryfiles'][] = ku_check_glossary_file($gen, $dir, $expected, $options['prefix']);
}
$report['mixedbank'] = ku_check_mixed_bank($gen, $dir, $manifest, $options['prefix']);

$files = array_merge($report['questionfiles'], $report['glossaryfiles'], $report['mixedbank'] ? [$report['mixedbank']] : []);
if ($options['cleanup']) {
    foreach ($files as $file) {
        ku_delete_course($file['course']);
    }
}
$report['coursesdeleted'] = (bool)$options['cleanup'];
$errors = array_sum(array_map(fn($file) => count($file['errors']), $files)) + count($phpwarnings);
$report['summary'] = [
    'questionfiles' => count($report['questionfiles']),
    'questionsimported' => array_sum(array_map(fn($f) => $f['imported']['total'] ?? 0, $report['questionfiles'])),
    'questionsfullmarks' => array_sum(array_map(fn($f) => $f['imported']['fullmarksforcorrectresponse'] ?? 0, $report['questionfiles'])),
    'glossaryfiles' => count($report['glossaryfiles']),
    'glossaryentriesimported' => array_sum(array_map(fn($f) => $f['imported']['total'] ?? 0, $report['glossaryfiles'])),
    'mixedbankquestions' => $report['mixedbank']['questionsinbank'] ?? null,
    'errors' => $errors,
    'phpwarnings' => count($phpwarnings),
];
$report['phpwarnings'] = $phpwarnings;
$report['totalseconds'] = round(microtime(true) - $started, 2);
$report['ok'] = $errors === 0;

$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($options['out'] !== '') {
    file_put_contents($options['out'], $json . "\n");
}
cli_writeln($json);
cli_writeln(sprintf('IMPORT CHECK %s: %d question files, %d glossary files, %d errors in %.2fs',
    $errors === 0 ? 'OK' : 'FAILED', count($report['questionfiles']), count($report['glossaryfiles']), $errors, $report['totalseconds']));
exit($errors === 0 ? 0 : 1);
