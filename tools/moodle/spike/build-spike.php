<?php
// Збирає мінімальний курс спайку в інстансі build.
// Запуск у контейнері: php /work/spike/build-spike.php [--shortname=KU-SPIKE] [--fixtures=/work/fixtures] [--out=/work/out] [--no-id-floor]
// Існуючий курс з тим самим shortname видаляється і збирається заново.

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once(__DIR__ . '/lib/util.php');
require_once(__DIR__ . '/lib/ids.php');
require_once(__DIR__ . '/lib/content.php');
require_once(__DIR__ . '/lib/questions.php');
require_once(__DIR__ . '/lib/gradebook.php');

[$options, $unrecognised] = cli_get_params(
    ['shortname' => 'KU-SPIKE', 'fixtures' => '/work/fixtures', 'out' => '/work/out', 'no-id-floor' => false, 'help' => false],
    ['h' => 'help']
);
if ($unrecognised) {
    cli_error('Unknown options: ' . implode(', ', $unrecognised));
}
if ($options['help']) {
    cli_writeln('php build-spike.php [--shortname=KU-SPIKE] [--fixtures=/work/fixtures] [--out=/work/out] [--no-id-floor]');
    cli_writeln('--no-id-floor  не піднімати id-послідовності (лише для відтворення колізій id при відновленні)');
    exit(0);
}

$fixtures = rtrim($options['fixtures'], '/');
$outdir = rtrim($options['out'], '/');
foreach (['questions.xml', 'book.zip', 'scorm12.zip'] as $required) {
    if (!is_readable("$fixtures/$required")) {
        cli_error("Missing fixture: $fixtures/$required (run fixtures/make-zips.sh)");
    }
}

// Збирання має бути гучним: усі попередження PHP (зокрема від імпортера XML при пропущених полях)
// збираються у звіт, а не приховуються налаштуванням debug сайту.
$phpwarnings = [];
set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline) use (&$phpwarnings) {
    $phpwarnings[] = sprintf('%d: %s at %s:%d', $errno, $errstr, str_replace('/var/www/html/', '', $errfile), $errline);
    return true;
});

\core_php_time_limit::raise();
raise_memory_limit(MEMORY_HUGE);
\core\session\manager::set_user(get_admin());

$timings = [];
$started = microtime(true);
$gen = \core\test\phpunit\phpunit_util::get_data_generator();
$report = ['moodle' => $CFG->release, 'version' => $CFG->version];

if ($existing = $DB->get_record('course', ['shortname' => $options['shortname']])) {
    spike_step('delete previous course', function () use ($existing) {
        spike_capture_output(fn() => delete_course($existing, false));
    }, $timings);
}

if ($options['no-id-floor']) {
    $report['idfloor'] = null;
} else {
    $raised = spike_step('raise id sequences', fn() => spike_raise_id_sequences(), $timings);
    $report['idfloor'] = ['floor' => SPIKE_ID_FLOOR, 'raisedsequences' => count($raised)];
}

$course = spike_step('course + 2 sections', fn() => spike_create_course($gen, $options['shortname'], [
    'SPIKE Модуль 1. Основи корпоративного управління',
    'SPIKE Модуль 2. Органи корпоративного управління',
]), $timings);
$report['courseid'] = (int)$course->id;

$report['book'] = spike_step('book (import ZIP chapters)',
    fn() => spike_create_book($gen, $course, 1, "$fixtures/book.zip"), $timings);
$report['page'] = spike_step('page', fn() => spike_create_page($gen, $course, 1), $timings);
$report['url'] = spike_step('url', fn() => spike_create_url($gen, $course, 1), $timings);
$report['glossary'] = spike_step('glossary with entries', fn() => spike_create_glossary($gen, $course, 1, [
    'Агентська проблема' => '<p>Конфлікт інтересів між власниками та менеджерами.</p>',
    'Кворум' => '<p>Мінімальна кількість голосів для правомочності зборів.</p>',
]), $timings);

$report['assign'] = spike_step('assign + rubric', fn() => spike_create_assign_with_rubric(
    $gen, $course, 2, 'Практична робота 1 (SPIKE)', 3, [
        'К1. Аналіз моделі КУ' => ['Не виконано' => 0, 'Частково' => 1, 'Повністю' => 2],
        'К2. Оформлення та джерела' => ['Не відповідає вимогам' => 0, 'Відповідає вимогам' => 1],
    ]), $timings);
$report['caseassign'] = spike_step('assign (case project)',
    fn() => spike_create_assign_plain($gen, $course, 2, 'Кейс-проєкт (SPIKE)', 12), $timings);

$bank = spike_step('question bank (mod_qbank)', fn() => spike_create_question_bank($course), $timings);
$report['qbank'] = $bank;
$import = spike_step('import Moodle XML', fn() => spike_import_questions($course, $bank, "$fixtures/questions.xml"), $timings);
$report['questions'] = array_values(array_map(fn($q) => [
    'idnumber' => $q->idnumber, 'qtype' => $q->qtype, 'category' => $q->categoryidnumber, 'name' => $q->name,
], $import['questions']));

$t01 = spike_category_by_idnumber($bank, 'SPIKE-M1-T01');
$bloom = ['bloom-remember', 'bloom-understand', 'bloom-apply', 'bloom-analyze'];

$quiz = spike_step('quiz: random by category+tag', function () use ($gen, $course, $t01, $bloom) {
    $quiz = spike_create_quiz($gen, $course, 2, 'Модульний тест 1 (SPIKE)', 6);
    spike_add_random_slots($quiz, $t01, $bloom);
    return $quiz;
}, $timings);
$report['quiz'] = ['cmid' => (int)$quiz->cmid, 'id' => (int)$quiz->id, 'grade' => (float)$DB->get_field('quiz', 'grade', ['id' => $quiz->id]),
    'filters' => spike_random_slot_filters($quiz->cmid)];

$byidnumber = [];
foreach ($import['questions'] as $q) {
    $byidnumber[$q->idnumber] = (int)$q->id;
}
$finalquiz = spike_step('quiz: fixed numerical + cloze', function () use ($gen, $course, $byidnumber) {
    $quiz = spike_create_quiz($gen, $course, 2, 'Підсумковий тест (SPIKE)', 40);
    spike_add_fixed_questions($quiz, [$byidnumber['SPIKE-T01-Q05'], $byidnumber['SPIKE-T01-Q08']]);
    return $quiz;
}, $timings);
$report['finalquiz'] = ['cmid' => (int)$finalquiz->cmid, 'id' => (int)$finalquiz->id,
    'grade' => (float)$DB->get_field('quiz', 'grade', ['id' => $finalquiz->id])];

$report['scorm'] = spike_step('scorm 1.2 package', fn() => spike_create_scorm($gen, $course, 2, "$fixtures/scorm12.zip"), $timings);

$report['gradebook'] = spike_step('gradebook categories', fn() => spike_setup_gradebook($course, [
    'Практичні роботи' => ['weight' => 24, 'items' => [['assign', $report['assign']->id]]],
    'Модульні тести' => ['weight' => 24, 'items' => [['quiz', $quiz->id]]],
    'Кейс-проєкт' => ['weight' => 12, 'items' => [['assign', $report['caseassign']->id]]],
    'Підсумковий тест' => ['weight' => 40, 'items' => [['quiz', $finalquiz->id]]],
    'Тренажери (поза підсумком)' => ['weight' => 0, 'items' => [['scorm', $report['scorm']->id]]],
]), $timings);

rebuild_course_cache($course->id, true);
$report['phpwarnings'] = $phpwarnings;
$report['questionimportlog'] = $import['log'];
$report['timings'] = $timings;
$report['totalseconds'] = round(microtime(true) - $started, 2);

$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (is_dir($outdir) && is_writable($outdir)) {
    file_put_contents("$outdir/spike-build.json", $json . "\n");
}
cli_writeln($json);
cli_writeln(sprintf('BUILD OK: course id %d in %.2fs', $course->id, $report['totalseconds']));
