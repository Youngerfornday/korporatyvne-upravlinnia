<?php
// Допоміжний CLI для перевірки зібраного курсу в інстансі verify. Друкує JSON.
//   php course-helper.php setup --password=<пароль> [--shortname=KU-COURSE]
//   php course-helper.php inspect --shortname=KU-COURSE
//   php course-helper.php restore-status --shortname=KU-COURSE
//   php course-helper.php close-quiz --shortname=KU-COURSE --quiz="Модульний тест 1"
//   php course-helper.php attempt-tags --shortname=KU-COURSE --quiz="Модульний тест 1"
//
// setup готує чистий інстанс: користувачі teacher1 (editingteacher) і student1 (student) з мовою uk
// і ПОРОЖНІЙ курс-ціль (наявний видаляється), бо журнал оцінок відновлюється лише в курс без своїх категорій.

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/grade/grade_item.php');
require_once($CFG->libdir . '/grade/grade_category.php');
require_once($CFG->libdir . '/enrollib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/grade/grading/lib.php');
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');

use core_course\cm_info;

$command = $argv[1] ?? '';
[$options] = cli_get_params([
    'shortname' => 'KU-COURSE',
    'quiz' => '',
    'password' => '',
    'username' => 'teacher1',
]);

\core\session\manager::set_user(get_admin());

function ku_helper_course(string $shortname): stdClass {
    global $DB;
    return $DB->get_record('course', ['shortname' => $shortname], '*', MUST_EXIST);
}

function ku_helper_user(string $username, string $firstname, string $password): stdClass {
    global $DB, $CFG;
    $user = $DB->get_record('user', ['username' => $username, 'mnethostid' => $CFG->mnet_localhost_id]);
    if (!$user) {
        $id = user_create_user((object)[
            'username' => $username,
            'password' => $password,
            'firstname' => $firstname,
            'lastname' => 'Перевірка',
            'email' => $username . '@example.com',
            'lang' => 'uk',
            'auth' => 'manual',
            'confirmed' => 1,
            'mnethostid' => $CFG->mnet_localhost_id,
        ], true, false);
        return $DB->get_record('user', ['id' => $id], '*', MUST_EXIST);
    }
    update_internal_user_password($user, $password);
    $DB->set_field('user', 'lang', 'uk', ['id' => $user->id]);
    return $user;
}

function ku_helper_enrol(stdClass $course, stdClass $user, string $roleshortname): void {
    global $DB;
    $plugin = enrol_get_plugin('manual');
    $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual']);
    if (!$instance) {
        $plugin->add_default_instance($course);
        $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', MUST_EXIST);
    }
    $plugin->enrol_user($instance, $user->id, $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST));
}

/** Порожній курс-ціль: наявний видаляється, щоб кожна перевірка починалася з чистого аркуша. */
function ku_helper_setup(string $shortname, string $password): array {
    global $DB;
    if (strlen($password) < 8) {
        cli_error('--password (мінімум 8 символів) обов’язковий');
    }
    $teacher = ku_helper_user('teacher1', 'Викладач', $password);
    $student = ku_helper_user('student1', 'Студент', $password);

    if ($existing = $DB->get_record('course', ['shortname' => $shortname])) {
        ob_start();
        delete_course($existing, false);
        ob_end_clean();
    }
    $course = create_course((object)[
        'fullname' => 'Курс-ціль для перевірки відновлення',
        'shortname' => $shortname,
        'category' => core_course_category::get_default()->id,
        'format' => 'topics',
        'numsections' => 0,
        'lang' => 'uk',
    ]);
    ku_helper_enrol($course, $teacher, 'editingteacher');
    ku_helper_enrol($course, $student, 'student');
    $context = context_course::instance($course->id);
    return [
        'courseid' => (int)$course->id,
        'contextid' => (int)$context->id,
        'teacherid' => (int)$teacher->id,
        'studentid' => (int)$student->id,
        'teacherHasRestoreUserinfo' => has_capability('moodle/restore:userinfo', $context, $teacher),
        'teacherIsSiteAdmin' => is_siteadmin($teacher),
    ];
}

function ku_helper_tag_names(array $ids): array {
    global $DB;
    if (!$ids) {
        return [];
    }
    [$insql, $params] = $DB->get_in_or_equal($ids);
    $names = $DB->get_fieldset_select('tag', 'name', "id $insql", $params);
    sort($names);
    return array_values($names);
}

function ku_helper_quiz(stdClass $course, cm_info $cm): array {
    global $DB;
    $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
    $context = context_module::instance($cm->id);
    $references = $DB->get_records('question_set_references',
        ['usingcontextid' => $context->id, 'component' => 'mod_quiz', 'questionarea' => 'slot'], 'itemid');
    $filters = [];
    foreach ($references as $reference) {
        $filter = json_decode($reference->filtercondition, true)['filter'] ?? [];
        $categoryid = $filter['category']['values'][0] ?? null;
        $filters[] = [
            'category' => $categoryid === null ? null : $DB->get_field('question_categories', 'idnumber', ['id' => $categoryid]),
            'includesubcategories' => (bool)($filter['category']['filteroptions']['includesubcategories'] ?? false),
            'tags' => ku_helper_tag_names($filter['qtagids']['values'] ?? []),
            'hasTagFilter' => isset($filter['qtagids']),
        ];
    }
    return [
        'cmid' => (int)$cm->id,
        'id' => (int)$quiz->id,
        'grade' => (float)$quiz->grade,
        'sumgrades' => (float)$quiz->sumgrades,
        'slots' => (int)$DB->count_records('quiz_slots', ['quizid' => $quiz->id]),
        'randomslots' => $filters,
        'timelimit' => (int)$quiz->timelimit,
        'timeclose' => (int)$quiz->timeclose,
        'attempts' => (int)$quiz->attempts,
        'reviewrightanswer' => (int)$quiz->reviewrightanswer,
        'reviewcorrectness' => (int)$quiz->reviewcorrectness,
        'reviewmarks' => (int)$quiz->reviewmarks,
    ];
}

function ku_helper_assign(cm_info $cm): array {
    $context = context_module::instance($cm->id);
    $manager = get_grading_manager($context, 'mod_assign', 'submissions');
    $method = $manager->get_active_method();
    $definition = $method ? $manager->get_controller($method)->get_definition() : null;
    $criteria = [];
    if ($definition && !empty($definition->rubric_criteria)) {
        foreach ($definition->rubric_criteria as $criterion) {
            $criteria[$criterion['description']] = array_values(array_map(
                fn($level) => (float)$level['score'],
                $criterion['levels']
            ));
        }
    }
    return [
        'cmid' => (int)$cm->id,
        'method' => $method,
        'status' => $definition ? (int)$definition->status : null,
        'criteria' => $criteria,
        'maxpoints' => array_sum(array_map(fn($scores) => $scores ? max($scores) : 0, $criteria)),
    ];
}

function ku_helper_inspect(stdClass $course): array {
    global $DB;
    $modinfo = get_fast_modinfo($course);
    $result = [
        'courseid' => (int)$course->id,
        'contextid' => (int)context_course::instance($course->id)->id,
        'sections' => [],
        'modules' => [],
        'books' => [],
        'quizzes' => [],
        'assigns' => [],
        'pages' => [],
        'urls' => [],
        'qbanks' => [],
    ];
    foreach ($modinfo->get_section_info_all() as $section) {
        $result['sections'][] = ['section' => $section->section, 'name' => get_section_name($course, $section)];
    }
    foreach ($modinfo->get_cms() as $cm) {
        $result['modules'][] = ['modname' => $cm->modname, 'name' => $cm->name, 'section' => $cm->sectionnum,
            'visible' => (int)$cm->visible, 'cmid' => (int)$cm->id];
        $context = context_module::instance($cm->id);
        switch ($cm->modname) {
            case 'book':
                $result['books'][$cm->name] = [
                    'cmid' => (int)$cm->id,
                    'chapters' => array_values($DB->get_fieldset_select('book_chapters', 'title', 'bookid = ? ORDER BY pagenum', [$cm->instance])),
                    'images' => array_values(array_map(fn($file) => $file->get_filename(), array_filter(
                        get_file_storage()->get_area_files($context->id, 'mod_book', 'chapter', false, 'id', false),
                        fn($file) => $file->get_mimetype() === 'image/svg+xml'))),
                ];
                sort($result['books'][$cm->name]['images']);
                break;
            case 'glossary':
                $result['glossary'] = ['cmid' => (int)$cm->id, 'name' => $cm->name,
                    'entries' => (int)$DB->count_records('glossary_entries', ['glossaryid' => $cm->instance]),
                    'categories' => (int)$DB->count_records('glossary_categories', ['glossaryid' => $cm->instance])];
                break;
            case 'quiz':
                $result['quizzes'][$cm->name] = ku_helper_quiz($course, $cm);
                break;
            case 'assign':
                $result['assigns'][$cm->name] = ku_helper_assign($cm);
                break;
            case 'page':
                $result['pages'][$cm->name] = ['cmid' => (int)$cm->id,
                    'content' => $DB->get_field('page', 'content', ['id' => $cm->instance])];
                break;
            case 'url':
                $result['urls'][$cm->name] = $DB->get_field('url', 'externalurl', ['id' => $cm->instance]);
                break;
            case 'qbank':
                $categories = $DB->get_records('question_categories', ['contextid' => $context->id], 'idnumber');
                $counts = [];
                foreach ($categories as $category) {
                    $counts[(string)$category->idnumber] = (int)$DB->count_records_sql(
                        "SELECT COUNT(DISTINCT qbe.id) FROM {question_bank_entries} qbe
                           JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                           JOIN {question} q ON q.id = qv.questionid
                          WHERE qbe.questioncategoryid = ? AND q.parent = 0", [$category->id]);
                }
                $result['qbanks'][] = ['cmid' => (int)$cm->id, 'name' => $cm->name,
                    'visible' => (int)$cm->visible, 'categories' => $counts, 'questions' => array_sum($counts)];
                break;
        }
    }
    $coursecategory = grade_category::fetch_course_category($course->id);
    $result['gradebook'] = [
        'courseaggregation' => (int)$coursecategory->aggregation,
        'aggregateonlygraded' => (int)$coursecategory->aggregateonlygraded,
        'coursetotalmax' => (float)$coursecategory->load_grade_item()->grademax,
        'categories' => [],
    ];
    foreach (grade_category::fetch_all(['courseid' => $course->id]) ?: [] as $category) {
        if ($category->is_course_category()) {
            continue;
        }
        $items = grade_item::fetch_all(['categoryid' => $category->id]) ?: [];
        $result['gradebook']['categories'][$category->fullname] = [
            'weight' => (float)$category->load_grade_item()->aggregationcoef,
            'items' => count($items),
            'maxsum' => array_sum(array_map(fn($item) => (float)$item->grademax, $items)),
        ];
    }
    ksort($result['gradebook']['categories']);
    return $result;
}

function ku_helper_restore_status(stdClass $course): array {
    global $DB;
    $records = $DB->get_records('backup_controllers', ['operation' => 'restore', 'itemid' => $course->id],
        'id DESC', 'id, status, userid, timemodified', 0, 1);
    $record = reset($records);
    return [
        'courseid' => (int)$course->id,
        'status' => $record ? (int)$record->status : null,
        'finished' => $record && in_array((int)$record->status, [backup::STATUS_FINISHED_OK, backup::STATUS_FINISHED_ERR], true),
        'ok' => $record && (int)$record->status === backup::STATUS_FINISHED_OK,
    ];
}

/**
 * Питання, які випадкові слоти справді витягли в останню спробу тесту, з їхніми тегами:
 * саме це доводить баланс рівнів Блума, а не лише налаштування фільтрів.
 */
function ku_helper_attempt_tags(stdClass $course, string $quizname): array {
    global $DB;
    $quiz = $DB->get_record('quiz', ['course' => $course->id, 'name' => $quizname], '*', MUST_EXIST);
    $attempts = $DB->get_records('quiz_attempts', ['quiz' => $quiz->id], 'id DESC', 'id, uniqueid, preview, userid', 0, 1);
    $attempt = reset($attempts);
    if (!$attempt) {
        return ['quiz' => $quizname, 'attempt' => null, 'questions' => []];
    }
    $slots = $DB->get_records_sql(
        "SELECT qat.slot, qat.questionid, qbe.idnumber, qc.idnumber AS category
           FROM {question_attempts} qat
           JOIN {question} q ON q.id = qat.questionid
           JOIN {question_versions} qv ON qv.questionid = q.id
           JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
           JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
          WHERE qat.questionusageid = ? ORDER BY qat.slot", [$attempt->uniqueid]);
    $questions = [];
    foreach ($slots as $slot) {
        $tags = array_values(array_map(fn($tag) => $tag->name,
            core_tag_tag::get_item_tags('core_question', 'question', $slot->questionid)));
        sort($tags);
        $questions[] = ['slot' => (int)$slot->slot, 'idnumber' => $slot->idnumber, 'category' => $slot->category, 'tags' => $tags];
    }
    return ['quiz' => $quizname, 'attempt' => (int)$attempt->id, 'preview' => (int)$attempt->preview, 'questions' => $questions];
}

switch ($command) {
    case 'setup':
        $out = ku_helper_setup($options['shortname'], $options['password']);
        break;
    case 'inspect':
        $out = ku_helper_inspect(ku_helper_course($options['shortname']));
        break;
    case 'restore-status':
        $out = ku_helper_restore_status(ku_helper_course($options['shortname']));
        break;
    case 'close-quiz':
        $course = ku_helper_course($options['shortname']);
        $quiz = $DB->get_record('quiz', ['course' => $course->id, 'name' => $options['quiz']], '*', MUST_EXIST);
        $DB->set_field('quiz', 'timeclose', time() - 60, ['id' => $quiz->id]);
        purge_caches(['muc' => true]);
        $out = ['quizid' => (int)$quiz->id, 'timeclose' => time() - 60];
        break;
    case 'attempt-tags':
        $out = ku_helper_attempt_tags(ku_helper_course($options['shortname']), $options['quiz']);
        break;
    default:
        cli_error('Невідома команда. Доступні: setup | inspect | restore-status | close-quiz | attempt-tags');
}
cli_writeln(json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
