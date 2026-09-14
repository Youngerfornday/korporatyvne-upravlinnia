<?php
// Навчальні матеріали спайку: розділи, Книга (імпорт ZIP), Сторінка, URL, Глосарій, Завдання з рубрикою, SCORM.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/book/locallib.php');
require_once($CFG->dirroot . '/mod/book/tool/importhtml/locallib.php');
require_once($CFG->dirroot . '/mod/scorm/locallib.php');

/**
 * Створює курс із заданою кількістю розділів і назвами розділів.
 */
function spike_create_course(testing_data_generator $gen, string $shortname, array $sectionnames): stdClass {
    $course = $gen->create_course([
        'fullname' => 'Корпоративне управління (SPIKE)',
        'shortname' => $shortname,
        'format' => 'topics',
        'numsections' => count($sectionnames),
        'summary' => '<p>Мінімальний курс спайку: по одному екземпляру кожного елемента.</p>',
        'summaryformat' => FORMAT_HTML,
        'lang' => 'uk',
        'showgrades' => 1,
    ]);
    $modinfo = get_fast_modinfo($course);
    foreach ($sectionnames as $num => $name) {
        $section = $modinfo->get_section_info($num + 1);
        course_update_section($course, $section, ['name' => $name]);
    }
    return $course;
}

/**
 * Модуль «Книга» з главами, імпортованими з ZIP (кожен HTML верхнього рівня - окрема глава).
 *
 * toolbook_importhtml_import_chapters() приймає stored_file, тому ZIP спершу кладемо в чернетку.
 * Тип 2 = typezipfiles (глави - HTML-файли в корені архіву), тип 1 = typezipdirs (глави - каталоги).
 */
function spike_create_book(testing_data_generator $gen, stdClass $course, int $section, string $zippath): stdClass {
    global $DB;

    $book = $gen->create_module('book', [
        'course' => $course->id,
        'section' => $section,
        'name' => 'Книга: Тема 1 (SPIKE)',
        'intro' => '<p>Глави імпортовано з ZIP через booktool_importhtml.</p>',
        'introformat' => FORMAT_HTML,
    ]);
    $context = context_module::instance($book->cmid);
    [, $package] = spike_file_to_draft($zippath);
    $bookrecord = $DB->get_record('book', ['id' => $book->id], '*', MUST_EXIST);

    [, $output] = spike_capture_output(
        fn() => toolbook_importhtml_import_chapters($package, 2, $bookrecord, $context, false)
    );
    $package->delete();

    $chapters = $DB->count_records('book_chapters', ['bookid' => $book->id]);
    if ($chapters < 2) {
        throw new moodle_exception('spike: book import produced ' . $chapters . ' chapters: ' . spike_html_to_text($output));
    }
    $svgfiles = count(array_filter(
        get_file_storage()->get_area_files($context->id, 'mod_book', 'chapter', false, 'id', false),
        fn(stored_file $f) => $f->get_mimetype() === 'image/svg+xml'
    ));
    return (object)['cmid' => $book->cmid, 'id' => $book->id, 'chapters' => $chapters, 'svgfiles' => $svgfiles];
}

function spike_create_page(testing_data_generator $gen, stdClass $course, int $section): stdClass {
    $page = $gen->create_module('page', [
        'course' => $course->id,
        'section' => $section,
        'name' => 'Сторінка: Силабус (SPIKE)',
        'content' => '<h3>Силабус</h3><p>4 кредити ЄКТС, 120 год. Оцінювання: 24/24/12/40.</p>',
        'contentformat' => FORMAT_HTML,
    ]);
    return (object)['cmid' => $page->cmid, 'id' => $page->id];
}

function spike_create_url(testing_data_generator $gen, stdClass $course, int $section): stdClass {
    $url = $gen->create_module('url', [
        'course' => $course->id,
        'section' => $section,
        'name' => 'Сайт курсу (SPIKE)',
        'externalurl' => 'https://youngerfornday.github.io/korporatyvne-upravlinnia/',
        'display' => 0,
    ]);
    return (object)['cmid' => $url->cmid, 'id' => $url->id];
}

/**
 * Глосарій із записами, створеними від імені поточного користувача.
 * Записи глосарію в Moodle - дані користувачів: у резервну копію вони потрапляють лише з userinfo.
 */
function spike_create_glossary(testing_data_generator $gen, stdClass $course, int $section, array $entries): stdClass {
    $glossary = $gen->create_module('glossary', [
        'course' => $course->id,
        'section' => $section,
        'name' => 'Глосарій (SPIKE)',
        'intro' => '<p>Терміни курсу.</p>',
        'introformat' => FORMAT_HTML,
        'displayformat' => 'dictionary',
        'defaultapproval' => 1,
    ]);
    $glossarygen = $gen->get_plugin_generator('mod_glossary');
    foreach ($entries as $concept => $definition) {
        $glossarygen->create_content($glossary, [
            'concept' => $concept,
            'definition' => $definition,
            'definitionformat' => FORMAT_HTML,
            'approved' => 1,
        ]);
    }
    return (object)['cmid' => $glossary->cmid, 'id' => $glossary->id, 'entries' => count($entries)];
}

/**
 * Завдання з рубрикою. Назви критеріїв - ключі масиву, тому мусять бути унікальними
 * (дублікат мовчки перезапише попередній критерій).
 */
function spike_create_assign_with_rubric(testing_data_generator $gen, stdClass $course, int $section,
        string $name, int $maxgrade, array $criteria): stdClass {
    $assign = $gen->create_module('assign', [
        'course' => $course->id,
        'section' => $section,
        'name' => $name,
        'intro' => '<p>Практична робота з оцінюванням за рубрикою.</p>',
        'introformat' => FORMAT_HTML,
        'grade' => $maxgrade,
        'assignsubmission_onlinetext_enabled' => 1,
        'assignsubmission_file_enabled' => 0,
    ]);
    $context = context_module::instance($assign->cmid);
    $rubricgen = $gen->get_plugin_generator('gradingform_rubric');
    $controller = $rubricgen->create_instance($context, 'mod_assign', 'submissions',
        'Рубрика: ' . $name, 'Критерії оцінювання практичної роботи', $criteria);
    $definition = $controller->get_definition();
    return (object)[
        'cmid' => $assign->cmid,
        'id' => $assign->id,
        'rubricstatus' => (int)$definition->status,
        'criteria' => count($definition->rubric_criteria),
    ];
}

function spike_create_assign_plain(testing_data_generator $gen, stdClass $course, int $section,
        string $name, int $maxgrade): stdClass {
    $assign = $gen->create_module('assign', [
        'course' => $course->id,
        'section' => $section,
        'name' => $name,
        'intro' => '<p>Кейс-проєкт.</p>',
        'introformat' => FORMAT_HTML,
        'grade' => $maxgrade,
        'assignsubmission_onlinetext_enabled' => 1,
    ]);
    return (object)['cmid' => $assign->cmid, 'id' => $assign->id];
}

/**
 * SCORM 1.2 з локального ZIP. Генератор mod_scorm приймає packagefilepath лише всередині $CFG->dirroot,
 * тому передаємо готову чернетку через packagefile (так само робить форма модуля).
 */
function spike_create_scorm(testing_data_generator $gen, stdClass $course, int $section, string $zippath): stdClass {
    global $DB;

    [$draftitemid] = spike_file_to_draft($zippath);
    $scorm = $gen->create_module('scorm', [
        'course' => $course->id,
        'section' => $section,
        'name' => 'Тренажер SCORM (SPIKE)',
        'packagefile' => $draftitemid,
        'grademethod' => GRADEHIGHEST,
        'maxgrade' => 100,
        'maxattempt' => 0,
        'whatgrade' => 0,
        'popup' => 0,
        'skipview' => 2,
        'hidetoc' => 3,
    ]);
    $scoes = $DB->count_records_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$scorm->id]);
    if ($scoes !== 1) {
        throw new moodle_exception('spike: SCORM package parsed into ' . $scoes . ' SCOs');
    }
    return (object)['cmid' => $scorm->cmid, 'id' => $scorm->id, 'scoes' => $scoes,
        'version' => $DB->get_field('scorm', 'version', ['id' => $scorm->id])];
}
