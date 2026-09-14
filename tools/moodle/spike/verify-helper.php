<?php
// Допоміжний CLI для перевірок у інстансі verify. Друкує JSON.
// php verify-helper.php inspect --shortname=KU-RESTORE
// php verify-helper.php restore-status --shortname=KU-RESTORE
// php verify-helper.php close-quiz --shortname=KU-RESTORE --quiz="Підсумковий тест (SPIKE)"
// php verify-helper.php user-results --shortname=KU-RESTORE --username=student1

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/grade/grade_item.php');
require_once($CFG->libdir . '/grade/grade_category.php');
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');

$command = $argv[1] ?? '';
[$options] = cli_get_params(['shortname' => '', 'quiz' => '', 'username' => '']);

function helper_course(string $shortname): stdClass {
    global $DB;
    return $DB->get_record('course', ['shortname' => $shortname], '*', MUST_EXIST);
}

function helper_tag_names(array $ids): array {
    global $DB;
    if (!$ids) {
        return [];
    }
    [$insql, $params] = $DB->get_in_or_equal($ids);
    return array_values($DB->get_fieldset_select('tag', 'name', "id $insql", $params));
}

/** Теги кожного питання верхнього рівня банку: idnumber => [назви тегів]. */
function helper_question_tags(int $contextid): array {
    global $DB;
    $sql = "SELECT q.id, qbe.idnumber
              FROM {question} q
              JOIN {question_versions} qv ON qv.questionid = q.id
              JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
              JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
             WHERE qc.contextid = ? AND q.parent = 0
          ORDER BY qbe.idnumber";
    $result = [];
    foreach ($DB->get_records_sql($sql, [$contextid]) as $question) {
        $names = array_values(array_map(fn($tag) => $tag->name,
            core_tag_tag::get_item_tags('core_question', 'question', $question->id)));
        sort($names);
        $result[$question->idnumber] = $names;
    }
    return $result;
}

function helper_inspect(stdClass $course): array {
    global $DB;
    $modinfo = get_fast_modinfo($course);
    $result = ['courseid' => (int)$course->id, 'contextid' => (int)context_course::instance($course->id)->id,
        'sections' => [], 'modules' => []];
    foreach ($modinfo->get_section_info_all() as $section) {
        $result['sections'][] = ['section' => $section->section, 'name' => get_section_name($course, $section)];
    }
    foreach ($modinfo->get_cms() as $cm) {
        $result['modules'][] = ['cmid' => (int)$cm->id, 'modname' => $cm->modname, 'name' => $cm->name,
            'section' => $cm->sectionnum, 'instance' => (int)$cm->instance];
        $context = context_module::instance($cm->id);
        switch ($cm->modname) {
            case 'book':
                $result['book'] = [
                    'cmid' => (int)$cm->id,
                    'chapters' => array_values($DB->get_fieldset_select('book_chapters', 'title', 'bookid = ? ORDER BY pagenum', [$cm->instance])),
                    'svgfiles' => array_values(array_map(fn($f) => $f->get_filename(), array_filter(
                        get_file_storage()->get_area_files($context->id, 'mod_book', 'chapter', false, 'id', false),
                        fn($f) => $f->get_mimetype() === 'image/svg+xml'))),
                ];
                break;
            case 'glossary':
                $result['glossary'] = ['cmid' => (int)$cm->id, 'id' => (int)$cm->instance,
                    'entries' => $DB->count_records('glossary_entries', ['glossaryid' => $cm->instance]),
                    'categories' => $DB->count_records('glossary_categories', ['glossaryid' => $cm->instance])];
                break;
            case 'quiz':
                $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
                $refs = $DB->get_records('question_set_references',
                    ['usingcontextid' => $context->id, 'component' => 'mod_quiz', 'questionarea' => 'slot'], 'itemid');
                $filters = [];
                foreach ($refs as $ref) {
                    $filter = json_decode($ref->filtercondition, true)['filter'] ?? [];
                    $catid = $filter['category']['values'][0] ?? null;
                    $filters[] = [
                        'category' => $catid ? $DB->get_field('question_categories', 'idnumber', ['id' => $catid]) : null,
                        'tags' => helper_tag_names($filter['qtagids']['values'] ?? []),
                        'hasTagFilter' => isset($filter['qtagids']),
                    ];
                }
                $result['quizzes'][$cm->name] = [
                    'cmid' => (int)$cm->id, 'id' => (int)$quiz->id, 'grade' => (float)$quiz->grade,
                    'sumgrades' => (float)$quiz->sumgrades, 'timeclose' => (int)$quiz->timeclose,
                    'slots' => $DB->count_records('quiz_slots', ['quizid' => $quiz->id]),
                    'randomslots' => $filters,
                    'reviewrightanswer' => (int)$quiz->reviewrightanswer,
                    'reviewcorrectness' => (int)$quiz->reviewcorrectness,
                    'reviewmarks' => (int)$quiz->reviewmarks,
                ];
                break;
            case 'assign':
                $manager = get_grading_manager($context, 'mod_assign', 'submissions');
                $method = $manager->get_active_method();
                $definition = $method ? $manager->get_controller($method)->get_definition() : null;
                $result['assigns'][$cm->name] = ['cmid' => (int)$cm->id, 'method' => $method,
                    'status' => $definition ? (int)$definition->status : null,
                    'criteria' => $definition && !empty($definition->rubric_criteria)
                        ? array_values(array_map(fn($c) => $c['description'], $definition->rubric_criteria)) : []];
                break;
            case 'scorm':
                $result['scorm'] = ['cmid' => (int)$cm->id, 'id' => (int)$cm->instance,
                    'version' => $DB->get_field('scorm', 'version', ['id' => $cm->instance]),
                    'grademethod' => (int)$DB->get_field('scorm', 'grademethod', ['id' => $cm->instance]),
                    'scoes' => $DB->count_records_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$cm->instance])];
                break;
            case 'qbank':
                $result['qbanks'][] = ['cmid' => (int)$cm->id,
                    'questions' => (int)$DB->count_records_sql(
                        "SELECT COUNT(DISTINCT qbe.id) FROM {question_bank_entries} qbe
                           JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
                           JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                           JOIN {question} q ON q.id = qv.questionid
                          WHERE qc.contextid = ? AND q.parent = 0", [$context->id]),
                    'categories' => array_values($DB->get_fieldset_select('question_categories', 'idnumber',
                        'contextid = ? AND idnumber IS NOT NULL', [$context->id])),
                    'questiontags' => helper_question_tags($context->id)];
                break;
        }
    }
    $coursecat = grade_category::fetch_course_category($course->id);
    $result['gradebook'] = ['courseaggregation' => (int)$coursecat->aggregation,
        'aggregateonlygraded' => (int)$coursecat->aggregateonlygraded,
        'coursetotalmax' => (float)$coursecat->load_grade_item()->grademax, 'categories' => []];
    foreach (grade_category::fetch_all(['courseid' => $course->id]) ?: [] as $category) {
        if ($category->is_course_category()) {
            continue;
        }
        $item = $category->load_grade_item();
        $children = grade_item::fetch_all(['categoryid' => $category->id]) ?: [];
        $result['gradebook']['categories'][$category->fullname] = [
            'weight' => (float)$item->aggregationcoef,
            'aggregation' => (int)$category->aggregation,
            'items' => array_values(array_map(fn($i) => $i->itemmodule . ':' . $i->itemname, $children)),
        ];
    }
    ksort($result['gradebook']['categories']);
    return $result;
}

function helper_restore_status(stdClass $course): array {
    global $DB;
    $records = $DB->get_records('backup_controllers', ['operation' => 'restore', 'itemid' => $course->id], 'id DESC', 'id, status, userid, timemodified', 0, 1);
    $record = reset($records);
    return ['courseid' => (int)$course->id, 'status' => $record ? (int)$record->status : null,
        'userid' => $record ? (int)$record->userid : null,
        'finished' => $record && in_array((int)$record->status, [backup::STATUS_FINISHED_OK, backup::STATUS_FINISHED_ERR], true),
        'ok' => $record && (int)$record->status === backup::STATUS_FINISHED_OK];
}

function helper_user_results(stdClass $course, string $username): array {
    global $DB;
    $user = $DB->get_record('user', ['username' => $username], '*', MUST_EXIST);
    grade_regrade_final_grades($course->id);
    $grades = [];
    foreach (grade_item::fetch_all(['courseid' => $course->id]) ?: [] as $item) {
        $grade = $DB->get_record('grade_grades', ['itemid' => $item->id, 'userid' => $user->id]);
        $label = $item->itemtype === 'course' ? 'course total' : ($item->itemtype === 'category'
            ? 'category: ' . grade_category::fetch(['id' => $item->iteminstance])->fullname
            : $item->itemmodule . ': ' . $item->itemname);
        $grades[$label] = ['final' => $grade && $grade->finalgrade !== null ? round((float)$grade->finalgrade, 2) : null,
            'max' => (float)$item->grademax];
    }
    ksort($grades);
    $attempts = $DB->get_records_sql(
        "SELECT qa.id, q.name, qa.state, qa.sumgrades, q.sumgrades AS maxsum, qa.uniqueid
           FROM {quiz_attempts} qa JOIN {quiz} q ON q.id = qa.quiz
          WHERE q.course = ? AND qa.userid = ? AND qa.preview = 0 ORDER BY qa.id", [$course->id, $user->id]);
    $attemptinfo = [];
    foreach ($attempts as $attempt) {
        $steps = $DB->get_records_sql(
            "SELECT qat.slot, qat.questionid, q.qtype, qat.responsesummary, qat.rightanswer,
                    (SELECT MAX(fraction) FROM {question_attempt_steps} s WHERE s.questionattemptid = qat.id) AS fraction
               FROM {question_attempts} qat JOIN {question} q ON q.id = qat.questionid
              WHERE qat.questionusageid = ? ORDER BY qat.slot", [$attempt->uniqueid]);
        $attemptinfo[] = ['quiz' => $attempt->name, 'state' => $attempt->state, 'sumgrades' => (float)$attempt->sumgrades,
            'maxsum' => (float)$attempt->maxsum, 'slots' => array_values(array_map(fn($s) => [
                'slot' => (int)$s->slot, 'qtype' => $s->qtype, 'response' => $s->responsesummary,
                'fraction' => $s->fraction === null ? null : (float)$s->fraction], $steps))];
    }
    return ['grades' => $grades, 'attempts' => $attemptinfo];
}

switch ($command) {
    case 'inspect':
        $out = helper_inspect(helper_course($options['shortname']));
        break;
    case 'restore-status':
        $out = helper_restore_status(helper_course($options['shortname']));
        break;
    case 'close-quiz':
        $course = helper_course($options['shortname']);
        $quiz = $DB->get_record('quiz', ['course' => $course->id, 'name' => $options['quiz']], '*', MUST_EXIST);
        $DB->set_field('quiz', 'timeclose', time() - 60, ['id' => $quiz->id]);
        purge_caches(['muc' => true]);
        $out = ['quizid' => (int)$quiz->id, 'timeclose' => time() - 60];
        break;
    case 'user-results':
        $out = helper_user_results(helper_course($options['shortname']), $options['username']);
        break;
    default:
        cli_error('Unknown command. Use: inspect | restore-status | close-quiz | user-results');
}
cli_writeln(json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
