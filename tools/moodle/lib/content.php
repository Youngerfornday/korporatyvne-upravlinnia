<?php
// Навчальні матеріали курсу: розділи, Книга з ZIP глав, Сторінка, Посилання, Глосарій, Завдання з рубрикою, SCORM.
// Кожна функція отримує опис елемента з plan.json і повертає дані створеного модуля для звіту.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/book/locallib.php');
require_once($CFG->dirroot . '/mod/book/tool/importhtml/locallib.php');
require_once($CFG->dirroot . '/grade/grading/lib.php');

/**
 * Створює курс за планом, видаливши попередній курс із тим самим коротким іменем.
 */
function ku_create_course(testing_data_generator $gen, array $plan): stdClass {
    global $DB;

    if ($existing = $DB->get_record('course', ['shortname' => $plan['shortname']])) {
        ku_capture_output(fn() => delete_course($existing, false));
    }
    return $gen->create_course([
        'fullname' => $plan['fullname'],
        'shortname' => $plan['shortname'],
        'format' => ku_value($plan, 'format', 'topics'),
        'numsections' => (int)$plan['numsections'],
        'summary' => ku_value($plan, 'summary', ''),
        'summaryformat' => FORMAT_HTML,
        'lang' => ku_value($plan, 'lang', 'uk'),
        'showgrades' => 1,
        'enablecompletion' => 0,
    ]);
}

/** Назва й опис розділу курсу. Розділ 0 («Загальне») теж має назву. */
function ku_update_section(stdClass $course, int $number, string $name, string $summary): void {
    $section = get_fast_modinfo($course)->get_section_info($number);
    course_update_section($course, $section, [
        'name' => $name,
        'summary' => $summary,
        'summaryformat' => FORMAT_HTML,
    ]);
}

/**
 * Книга з главами, імпортованими з ZIP: тип 2 — кожен HTML у корені архіву є главою.
 * Функція імпорту друкує HTML-звіт, тому вивід перехоплюється.
 */
function ku_create_book(testing_data_generator $gen, stdClass $course, int $section, array $activity, string $zippath, ku_report $report): stdClass {
    global $DB;

    $book = $gen->create_module('book', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'intro', ''),
        'introformat' => FORMAT_HTML,
        'numbering' => 1,
    ]);
    $context = context_module::instance($book->cmid);
    [, $package] = ku_file_to_draft($zippath);
    $record = $DB->get_record('book', ['id' => $book->id], '*', MUST_EXIST);

    [, $output] = ku_capture_output(fn() => toolbook_importhtml_import_chapters($package, 2, $record, $context, false));
    $package->delete();

    $chapters = $DB->get_fieldset_select('book_chapters', 'title', 'bookid = ? ORDER BY pagenum', [$book->id]);
    if (count($chapters) === 0) {
        $report->warn("Книга «{$activity['name']}»: жодної глави не імпортовано — " . ku_html_to_text($output));
    }
    $expected = ku_value($activity, 'expectedChapters', []);
    if ($expected && count($expected) !== count($chapters)) {
        $report->warn(sprintf('Книга «%s»: глав у Moodle %d, у плані %d', $activity['name'], count($chapters), count($expected)));
    }
    $images = array_values(array_map(
        fn(stored_file $file) => $file->get_filename(),
        array_filter(
            get_file_storage()->get_area_files($context->id, 'mod_book', 'chapter', false, 'id', false),
            fn(stored_file $file) => $file->get_mimetype() === 'image/svg+xml'
        )
    ));
    sort($images);
    return (object)['cmid' => (int)$book->cmid, 'id' => (int)$book->id,
        'chapters' => array_values($chapters), 'images' => $images];
}

function ku_create_page(testing_data_generator $gen, stdClass $course, int $section, array $activity): stdClass {
    $page = $gen->create_module('page', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'intro', ''),
        'introformat' => FORMAT_HTML,
        'content' => ku_value($activity, 'content', ''),
        'contentformat' => FORMAT_HTML,
        'printheading' => 0,
        'printintro' => 0,
    ]);
    return (object)['cmid' => (int)$page->cmid, 'id' => (int)$page->id];
}

/** Посилання (URL): display = 0 — Moodle сам обирає спосіб показу, для зовнішнього сайту це нове вікно. */
function ku_create_url(testing_data_generator $gen, stdClass $course, int $section, array $activity): stdClass {
    $url = $gen->create_module('url', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'description', ''),
        'introformat' => FORMAT_HTML,
        'externalurl' => $activity['url'],
        'display' => 0,
    ]);
    return (object)['cmid' => (int)$url->cmid, 'id' => (int)$url->id, 'url' => $activity['url']];
}

/**
 * Глосарій без записів: записи Moodle вважає даними користувачів і не переносить резервною копією
 * без userinfo, тому вони їдуть окремим XML, який викладач імпортує вручну.
 */
function ku_create_glossary(testing_data_generator $gen, stdClass $course, int $section, array $activity): stdClass {
    $glossary = $gen->create_module('glossary', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'intro', ''),
        'introformat' => FORMAT_HTML,
        'displayformat' => 'dictionary',
        'mainglossary' => 1,
        'globalglossary' => 0,
        'usedynalink' => 1,
        'defaultapproval' => 1,
        'allowduplicatedentries' => 0,
        'allowcomments' => 0,
        'showalphabet' => 1,
        'showall' => 1,
        'showspecial' => 1,
    ]);
    return (object)['cmid' => (int)$glossary->cmid, 'id' => (int)$glossary->id];
}

/**
 * Завдання з рубрикою. Строків здачі не задаємо: календар курсу залежить від розкладу,
 * тому дати виставляє викладач після відновлення.
 */
function ku_create_assign(testing_data_generator $gen, stdClass $course, int $section, array $activity, ku_report $report): stdClass {
    $assign = $gen->create_module('assign', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'intro', ''),
        'introformat' => FORMAT_HTML,
        'alwaysshowdescription' => 1,
        'grade' => (float)$activity['grade'],
        'assignsubmission_onlinetext_enabled' => 1,
        'assignsubmission_file_enabled' => 1,
        'assignsubmission_file_maxfiles' => 3,
        'assignsubmission_file_maxsizebytes' => 0,
        'submissiondrafts' => 0,
        'duedate' => 0,
        'allowsubmissionsfromdate' => 0,
        'cutoffdate' => 0,
        'gradingduedate' => 0,
    ]);
    $rubric = ku_value($activity, 'rubric');
    if ($rubric === null) {
        return (object)['cmid' => (int)$assign->cmid, 'id' => (int)$assign->id, 'criteria' => [], 'rubricstatus' => null];
    }
    return ku_add_rubric($gen, $assign, $activity['name'], $rubric, $report);
}

/**
 * Тренажер SCORM 1.2 з ZIP-пакета. Генератор приймає `packagefilepath` лише всередині dirroot, тому пакет іде
 * через чернетку. Найвищий бал спроби з максимумом 100, плеєр одразу (skipview = 2) без змісту (hidetoc = 3);
 * нова спроба не примушується, тож при повторному вході тренажер відновлює прогрес із cmi.suspend_data.
 */
function ku_create_scorm(testing_data_generator $gen, stdClass $course, int $section, array $activity, string $zippath, ku_report $report): stdClass {
    global $DB;

    [$draftitemid] = ku_file_to_draft($zippath);
    $scorm = $gen->create_module('scorm', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'intro', ''),
        'introformat' => FORMAT_HTML,
        'packagefile' => $draftitemid,
        'grademethod' => GRADEHIGHEST,
        'maxgrade' => (float)ku_value($activity, 'maxgrade', 100),
        'maxattempt' => 0,
        'whatgrade' => 0,
        'forcenewattempt' => 0,
        'masteryoverride' => 1,
        'popup' => 0,
        'skipview' => 2,
        'hidetoc' => 3,
    ]);
    $scoes = $DB->count_records_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$scorm->id]);
    if ($scoes !== 1) {
        $report->warn("SCORM «{$activity['name']}»: у пакеті {$scoes} SCO замість одного");
    }
    $mastery = $DB->get_field_sql(
        "SELECT d.value FROM {scorm_scoes_data} d JOIN {scorm_scoes} s ON s.id = d.scoid
          WHERE s.scorm = ? AND d.name = 'masteryscore'", [$scorm->id], IGNORE_MULTIPLE);
    $expected = ku_value($activity, 'masteryPercent');
    if ($expected !== null && ($mastery === false || (float)$mastery !== (float)$expected)) {
        $report->warn(sprintf('SCORM «%s»: прохідний бал у Moodle %s, у плані %s', $activity['name'], var_export($mastery, true), $expected));
    }
    return (object)['cmid' => (int)$scorm->cmid, 'id' => (int)$scorm->id, 'scoes' => $scoes,
        'version' => $DB->get_field('scorm', 'version', ['id' => $scorm->id]),
        'masteryscore' => $mastery === false ? null : (float)$mastery];
}

/**
 * Рубрика оцінювання завдання через штатний API оцінювання за критеріями.
 *
 * Генератор `gradingform_rubric` тут не годиться: його `add_level()` оголошено з `int $score`,
 * тому рівні на 0,5 бала мовчки стали б нулем, а в рубриках курсу такі рівні є.
 * `update_definition()` — саме те, що викликає форма рубрики, і воно приймає дробові бали.
 */
function ku_add_rubric(testing_data_generator $gen, stdClass $assign, string $name, array $rubric, ku_report $report): stdClass {
    $criteria = [];
    $seen = [];
    $order = 0;
    foreach ($rubric['criteria'] as $criterion) {
        $title = $criterion['title'];
        if (isset($seen[$title])) {
            $report->warn("Рубрика «{$name}»: критерій «{$title}» повторюється — лишено перший");
            continue;
        }
        $seen[$title] = true;
        $order += 1;
        $levels = [];
        foreach (array_values($criterion['levels']) as $index => $level) {
            $levels['NEWID' . ($index + 1)] = ['definition' => $level['name'], 'score' => (float)$level['points']];
        }
        $criteria['NEWID' . $order] = ['sortorder' => $order, 'description' => $title, 'levels' => $levels];
    }

    $context = context_module::instance($assign->cmid);
    $manager = get_grading_manager($context, 'mod_assign', 'submissions');
    $manager->set_active_method('rubric');
    $controller = $manager->get_controller('rubric');
    $controller->update_definition((object)[
        'name' => $rubric['name'],
        'description_editor' => ['text' => ku_value($rubric, 'description', ''), 'format' => FORMAT_HTML, 'itemid' => 1],
        'rubric' => [
            'criteria' => $criteria,
            'options' => [
                'sortlevelsasc' => 1,
                'lockzeropoints' => 1,
                'showdescriptionteacher' => 1,
                'showdescriptionstudent' => 1,
                'showscoreteacher' => 1,
                'showscorestudent' => 1,
                'enableremarks' => 1,
                'showremarksstudent' => 1,
            ],
        ],
        'status' => gradingform_controller::DEFINITION_STATUS_READY,
    ]);

    $definition = $controller->get_definition(true);
    $points = array_map(
        fn($criterion) => max(array_map(fn($level) => (float)$level['score'], $criterion['levels'])),
        $definition->rubric_criteria
    );
    return (object)[
        'cmid' => (int)$assign->cmid,
        'id' => (int)$assign->id,
        'rubricstatus' => (int)$definition->status,
        'criteria' => array_values(array_map(fn($criterion) => $criterion['description'], $definition->rubric_criteria)),
        'maxpoints' => array_sum($points),
    ];
}
