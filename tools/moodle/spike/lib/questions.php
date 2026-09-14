<?php
// Банк питань Moodle 5.x (mod_qbank), імпорт Moodle XML, тести з випадковими питаннями за категорією й тегом.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

use core_question\local\bank\question_bank_helper;
use mod_quiz\quiz_settings;
use mod_quiz\structure;

/**
 * Створює стандартний (спільний) банк питань курсу - модуль mod_qbank у розділі 0, прихований.
 */
function spike_create_question_bank(stdClass $course): stdClass {
    $cm = question_bank_helper::create_default_open_instance(
        $course,
        'Банк питань SPIKE',
        question_bank_helper::TYPE_STANDARD
    );
    $context = context_module::instance($cm->id);
    $default = question_get_default_category($context->id, true);
    return (object)['cmid' => $cm->id, 'contextid' => $context->id, 'defaultcategoryid' => $default->id];
}

/**
 * Імпортує Moodle XML у банк так само, як question/bank/importquestions/import.php.
 * Категорії беруться з файлу (catfromfile), контекст - завжди банк (contextfromfile = false).
 */
function spike_import_questions(stdClass $course, stdClass $bank, string $xmlpath): array {
    global $DB;

    $context = context::instance_by_id($bank->contextid);
    $category = $DB->get_record('question_categories', ['id' => $bank->defaultcategoryid], '*', MUST_EXIST);

    $qformat = new qformat_xml();
    $qformat->setCategory($category);
    $qformat->setContexts([$context]);
    $qformat->setCourse($course);
    $qformat->setFilename($xmlpath);
    $qformat->setRealfilename(basename($xmlpath));
    $qformat->setMatchgrades('error');
    $qformat->setCatfromfile(true);
    $qformat->setContextfromfile(false);
    $qformat->setStoponerror(true);

    [$ok, $output] = spike_capture_output(function () use ($qformat) {
        return $qformat->importpreprocess() && $qformat->importprocess() && $qformat->importpostprocess();
    });
    if (!$ok) {
        throw new moodle_exception('spike: question import failed: ' . spike_html_to_text($output));
    }

    $sql = "SELECT q.id, q.name, q.qtype, qc.idnumber AS categoryidnumber, qbe.idnumber
              FROM {question} q
              JOIN {question_versions} qv ON qv.questionid = q.id
              JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
              JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
             WHERE qc.contextid = :contextid AND q.parent = 0
          ORDER BY qbe.idnumber";
    $questions = $DB->get_records_sql($sql, ['contextid' => $context->id]);
    return ['questions' => $questions, 'log' => spike_html_to_text($output)];
}

function spike_category_by_idnumber(stdClass $bank, string $idnumber): stdClass {
    global $DB;
    return $DB->get_record('question_categories',
        ['contextid' => $bank->contextid, 'idnumber' => $idnumber], '*', MUST_EXIST);
}

function spike_question_tag(string $name): core_tag_tag {
    $collid = core_tag_area::get_collection('core_question', 'question');
    $tag = core_tag_tag::get_by_name($collid, $name, 'id, name, rawname');
    if (!$tag) {
        throw new moodle_exception('spike: question tag not found: ' . $name);
    }
    return $tag;
}

/**
 * Налаштування перегляду спроби для контрольного тесту: бали видно одразу, а правильність,
 * відгуки й правильні відповіді - лише після закриття тесту.
 */
function spike_quiz_review_settings(): array {
    $settings = [];
    $always = ['attempt', 'marks', 'maxmarks', 'overallfeedback'];
    $afterclose = ['correctness', 'specificfeedback', 'generalfeedback', 'rightanswer'];
    foreach ($always as $item) {
        $settings[$item . 'during'] = 0;
        $settings[$item . 'immediately'] = 1;
        $settings[$item . 'open'] = 1;
        $settings[$item . 'closed'] = 1;
    }
    foreach ($afterclose as $item) {
        $settings[$item . 'during'] = 0;
        $settings[$item . 'immediately'] = 0;
        $settings[$item . 'open'] = 0;
        $settings[$item . 'closed'] = 1;
    }
    $settings['maxmarksduring'] = 1;
    return $settings;
}

function spike_create_quiz(testing_data_generator $gen, stdClass $course, int $section, string $name,
        float $maxgrade): stdClass {
    return $gen->create_module('quiz', [
        'course' => $course->id,
        'section' => $section,
        'name' => $name,
        'intro' => '<p>Тест спайку.</p>',
        'introformat' => FORMAT_HTML,
        'grade' => $maxgrade,
        'questionsperpage' => 0,
        'preferredbehaviour' => 'deferredfeedback',
        'shuffleanswers' => 1,
        'attempts' => 0,
    ] + spike_quiz_review_settings());
}

/**
 * Додає випадкові слоти з фільтром «категорія + тег». Формат filtercondition - той самий,
 * що формує вікно «Додати випадкове питання» (core_question\local\bank\condition + tag_condition).
 */
function spike_add_random_slots(stdClass $quiz, stdClass $category, array $tagnames, int $perTag = 1): void {
    $structure = structure::create_for_quiz(quiz_settings::create($quiz->id));
    foreach ($tagnames as $tagname) {
        $tag = spike_question_tag($tagname);
        $filtercondition = [
            'filter' => [
                'category' => [
                    'jointype' => \core_question\local\bank\condition::JOINTYPE_DEFAULT,
                    'values' => [$category->id],
                    'filteroptions' => ['includesubcategories' => false],
                ],
                'qtagids' => [
                    'jointype' => \qbank_tagquestion\tag_condition::JOINTYPE_DEFAULT,
                    'values' => [$tag->id],
                ],
            ],
        ];
        $structure->add_random_questions(0, $perTag, $filtercondition);
    }
    spike_finalise_quiz_grades($quiz);
}

function spike_add_fixed_questions(stdClass $quiz, array $questionids): void {
    foreach ($questionids as $questionid) {
        quiz_add_quiz_question($questionid, $quiz, 0);
    }
    spike_finalise_quiz_grades($quiz);
}

function spike_finalise_quiz_grades(stdClass $quiz): void {
    global $DB;
    $calculator = quiz_settings::create($quiz->id)->get_grade_calculator();
    $calculator->recompute_quiz_sumgrades();
    $grade = (float)$DB->get_field('quiz', 'grade', ['id' => $quiz->id]);
    $calculator->update_quiz_maximum_grade($grade);
}

/**
 * Повертає фільтри випадкових слотів тесту (для звіту й перевірки після відновлення).
 */
function spike_random_slot_filters(int $quizcmid): array {
    global $DB;
    $context = context_module::instance($quizcmid);
    $records = $DB->get_records('question_set_references',
        ['usingcontextid' => $context->id, 'component' => 'mod_quiz', 'questionarea' => 'slot'], 'itemid');
    return array_values(array_map(fn($r) => json_decode($r->filtercondition, true)['filter'] ?? [], $records));
}
