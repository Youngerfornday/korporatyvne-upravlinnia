<?php
// Збирає курс «Корпоративне управління» в інстансі build за планом, який приготував tools/moodle/build-plan.mjs.
// Запуск у контейнері (build-mbz.sh копіює каталог у /tmp/ku):
//   php /tmp/ku/build-course.php --plan=/work/out/build/plan.json --artifacts=/work/out/build --out=/work/out/build-course.json
//
// Скрипт нічого не вигадує: усі назви, тексти, бали, слоти тестів і ваги журналу беруться з плану,
// а план — з content/course.yaml і артефактів експорту. Чого немає в артефактах (ненаписана тема,
// відсутній банк), те пропускається з попередженням і потрапляє у звіт, а не ламає збірку.

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once(__DIR__ . '/lib/util.php');
require_once(__DIR__ . '/lib/ids.php');
require_once(__DIR__ . '/lib/content.php');
require_once(__DIR__ . '/lib/questions.php');
require_once(__DIR__ . '/lib/gradebook.php');

[$options, $unrecognised] = cli_get_params(
    ['plan' => '', 'artifacts' => '', 'out' => '', 'no-id-floor' => false, 'help' => false],
    ['h' => 'help']
);
if ($unrecognised) {
    cli_error('Невідомі параметри: ' . implode(', ', $unrecognised));
}
if ($options['help'] || $options['plan'] === '') {
    cli_writeln('php build-course.php --plan=<plan.json> [--artifacts=<каталог>] [--out=<звіт.json>] [--no-id-floor]');
    cli_writeln('--artifacts  каталог з questions-*.xml, glossary-*.xml і books/ (типово поруч із планом)');
    cli_writeln('--no-id-floor  не піднімати id-послідовності (лише для відтворення колізій id при відновленні)');
    exit($options['help'] ? 0 : 2);
}

$planfile = $options['plan'];
if (!is_readable($planfile)) {
    cli_error("Плану немає або він недоступний: {$planfile}");
}
$plan = json_decode(file_get_contents($planfile), true);
if (!is_array($plan) || !isset($plan['course'], $plan['sections'])) {
    cli_error("Файл плану не схожий на план курсу: {$planfile}");
}
$artifacts = rtrim($options['artifacts'] !== '' ? $options['artifacts'] : dirname($planfile), '/');

$report = new ku_report();
$report->capture_php_warnings();

\core_php_time_limit::raise();
raise_memory_limit(MEMORY_HUGE);
\core\session\manager::set_user(get_admin());

$started = microtime(true);
$gen = \core\test\phpunit\phpunit_util::get_data_generator();
$result = [
    'moodle' => $CFG->release,
    'version' => $CFG->version,
    'plan' => ['generatedAt' => ku_value($plan, 'generatedAt'), 'site' => ku_value($plan, 'site'),
        'quizKind' => $plan['bank']['quizKind'] ?? null, 'startDate' => ku_value($plan, 'startDate')],
    'planWarnings' => ku_value($plan, 'warnings', []),
];

if ($options['no-id-floor']) {
    $result['idfloor'] = null;
} else {
    $raised = $report->step('підняття id-послідовностей', fn() => ku_raise_id_sequences());
    $result['idfloor'] = ['floor' => KU_ID_FLOOR, 'raised' => count($raised)];
}

$course = $report->step('курс і розділи', function () use ($gen, $plan) {
    $course = ku_create_course($gen, $plan['course']);
    foreach ($plan['sections'] as $section) {
        ku_update_section($course, (int)$section['num'], $section['name'], ku_value($section, 'summary', ''));
    }
    return $course;
});
$result['courseid'] = (int)$course->id;
$result['shortname'] = $plan['course']['shortname'];

// Банк питань наповнюємо до тестів: випадкові слоти шукають категорії й теги саме в ньому.
$bank = $report->step('банк питань (mod_qbank)', fn() => ku_create_question_bank($course, $plan['bank']['name']));
$result['bank'] = ['cmid' => $bank->cmid, 'imports' => []];
foreach (ku_value($plan['bank'], 'files', []) as $file) {
    $path = "{$artifacts}/{$file['file']}";
    if (!is_readable($path)) {
        $report->warn("Файл питань {$file['file']} не знайдено — банк лишиться без цих питань");
        continue;
    }
    $result['bank']['imports'][] = $report->step("імпорт питань {$file['file']}",
        fn() => ku_import_questions($course, $bank, $path, $report));
}
$result['bank']['questions'] = ku_bank_questions($bank);
$result['bank']['total'] = count($result['bank']['questions']);

// Створення елементів курсу. Кожен елемент має ref: за ним журнал оцінок знаходить свій елемент оцінювання.
$created = [];
$modules = [];
foreach ($plan['sections'] as $section) {
    $number = (int)$section['num'];
    foreach ($section['activities'] as $activity) {
        $ref = $activity['ref'];
        $type = $activity['type'];
        $label = "{$type}: {$activity['name']}";
        switch ($type) {
            case 'book':
                $zip = "{$artifacts}/{$activity['zip']}";
                if (!is_readable($zip)) {
                    $report->warn("Книга «{$activity['name']}»: немає архіву глав {$activity['zip']} — пропущено");
                    break;
                }
                $created[$ref] = $report->step($label, fn() => ku_create_book($gen, $course, $number, $activity, $zip, $report));
                $modules[$ref] = ['book', $created[$ref]->id];
                break;
            case 'page':
                $created[$ref] = $report->step($label, fn() => ku_create_page($gen, $course, $number, $activity));
                break;
            case 'url':
                $created[$ref] = $report->step($label, fn() => ku_create_url($gen, $course, $number, $activity));
                break;
            case 'glossary':
                $created[$ref] = $report->step($label, fn() => ku_create_glossary($gen, $course, $number, $activity));
                break;
            case 'assign':
                $created[$ref] = $report->step($label, fn() => ku_create_assign($gen, $course, $number, $activity, $report));
                $modules[$ref] = ['assign', $created[$ref]->id];
                break;
            case 'scorm':
                $zip = "{$artifacts}/{$activity['zip']}";
                if (!is_readable($zip)) {
                    $report->warn("SCORM «{$activity['name']}»: немає пакета {$activity['zip']} — пропущено");
                    break;
                }
                $created[$ref] = $report->step($label, fn() => ku_create_scorm($gen, $course, $number, $activity, $zip, $report));
                $modules[$ref] = ['scorm', $created[$ref]->id];
                break;
            case 'quiz':
                $created[$ref] = $report->step($label, function () use ($gen, $course, $number, $activity, $bank, $report) {
                    $quiz = ku_create_quiz($gen, $course, $number, $activity);
                    ku_add_random_slots($quiz, $bank, ku_value($activity, 'slots', []), $activity['name'], $report);
                    return (object)ku_quiz_state($quiz, (int)$quiz->cmid);
                });
                $modules[$ref] = ['quiz', $created[$ref]->id];
                break;
            default:
                $report->warn("Невідомий тип елемента плану: {$type} ({$ref})");
        }
    }
}

// Журнал оцінок: категорії з вагами; елементи знаходяться за ref створених модулів.
$categories = [];
foreach (ku_value($plan['gradebook'], 'categories', []) as $category) {
    $items = [];
    foreach ($category['refs'] as $ref) {
        if (!isset($modules[$ref])) {
            $report->warn("Журнал оцінок: елемент {$ref} не створено — до категорії «{$category['name']}» не додано");
            continue;
        }
        $items[] = $modules[$ref];
    }
    if ($items === []) {
        $report->warn("Журнал оцінок: категорія «{$category['name']}» лишилася б порожньою — пропущено");
        continue;
    }
    $categories[] = ['name' => $category['name'], 'weight' => $category['weight'], 'items' => $items];
}
$report->step('журнал оцінок', fn() => ku_setup_gradebook($course, $categories, $report));
$result['gradebook'] = ku_gradebook_state($course);

rebuild_course_cache($course->id, true);

// Звіт: усе, що потім перевіряється у відновленому курсі.
$modinfo = get_fast_modinfo($course);
$result['sections'] = array_values(array_map(
    fn($section) => ['section' => $section->section, 'name' => get_section_name($course, $section)],
    $modinfo->get_section_info_all()
));
$result['modules'] = array_values(array_map(
    fn($cm) => ['modname' => $cm->modname, 'name' => $cm->name, 'section' => $cm->sectionnum],
    $modinfo->get_cms()
));
$result['activities'] = array_map(fn($item) => (array)$item, $created);
$result['glossaryImport'] = ku_value($plan, 'glossaryImport');
$result['warnings'] = $report->warnings;
$result['phpwarnings'] = $report->phpwarnings;
$result['timings'] = $report->timings;
$result['totalseconds'] = round(microtime(true) - $started, 2);

$json = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($options['out'] !== '') {
    file_put_contents($options['out'], $json . "\n");
}
cli_writeln(sprintf(
    'BUILD OK: курс %d, елементів %d, питань %d, попереджень %d, %.2fs',
    $course->id,
    count($result['modules']),
    $result['bank']['total'],
    count($result['warnings']),
    $result['totalseconds']
));
