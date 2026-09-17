<?php
// Банк питань курсу (mod_qbank), імпорт Moodle XML і тести з випадковими питаннями
// за фільтром «категорія + тег рівня Блума».

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

use core_question\local\bank\question_bank_helper;
use mod_quiz\quiz_settings;
use mod_quiz\structure;

/** Стандартний (спільний) банк питань курсу — модуль mod_qbank у розділі 0, прихований від студентів. */
function ku_create_question_bank(stdClass $course, string $name): stdClass {
    $cm = question_bank_helper::create_default_open_instance($course, $name, question_bank_helper::TYPE_STANDARD);
    $context = context_module::instance($cm->id);
    return (object)[
        'cmid' => (int)$cm->id,
        'contextid' => (int)$context->id,
        'defaultcategoryid' => (int)question_get_default_category($context->id, true)->id,
    ];
}

/**
 * Імпортує Moodle XML у банк так само, як question/bank/importquestions/import.php:
 * категорії з файлу, контекст завжди банк, недопустимий відсоток оцінки — помилка, а не округлення.
 */
function ku_import_questions(stdClass $course, stdClass $bank, string $xmlpath, ku_report $report): array {
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

    [$ok, $output] = ku_capture_output(
        fn() => $qformat->importpreprocess() && $qformat->importprocess() && $qformat->importpostprocess()
    );
    if (!$ok) {
        $report->warn('Імпорт питань ' . basename($xmlpath) . ' не вдався: ' . ku_html_to_text($output));
        return ['file' => basename($xmlpath), 'ok' => false, 'log' => ku_html_to_text($output)];
    }
    return ['file' => basename($xmlpath), 'ok' => true, 'log' => ku_html_to_text($output)];
}

/** Питання банку за idnumber: кількість і теги — для звіту й перевірки після відновлення. */
function ku_bank_questions(stdClass $bank): array {
    global $DB;

    $sql = "SELECT q.id, qbe.idnumber, q.qtype, qc.idnumber AS categoryidnumber
              FROM {question} q
              JOIN {question_versions} qv ON qv.questionid = q.id
              JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
              JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
             WHERE qc.contextid = :contextid AND q.parent = 0
          ORDER BY qbe.idnumber";
    $questions = [];
    foreach ($DB->get_records_sql($sql, ['contextid' => $bank->contextid]) as $question) {
        $tags = array_values(array_map(
            fn($tag) => $tag->name,
            core_tag_tag::get_item_tags('core_question', 'question', $question->id)
        ));
        sort($tags);
        $questions[$question->idnumber] = ['qtype' => $question->qtype, 'category' => $question->categoryidnumber, 'tags' => $tags];
    }
    return $questions;
}

function ku_category_by_idnumber(stdClass $bank, string $idnumber): ?stdClass {
    global $DB;
    $category = $DB->get_record('question_categories', ['contextid' => $bank->contextid, 'idnumber' => $idnumber]);
    return $category === false ? null : $category;
}

function ku_question_tag(string $name): ?core_tag_tag {
    $collection = core_tag_area::get_collection('core_question', 'question');
    $tag = core_tag_tag::get_by_name($collection, $name, 'id, name, rawname');
    return $tag === false ? null : $tag;
}

/**
 * Тест курсу. Без `timeclose` режим «правильні відповіді після закриття» не настає ніколи,
 * тому дата закриття задається планом (за календарним планом курсу).
 */
function ku_create_quiz(testing_data_generator $gen, stdClass $course, int $section, array $activity): stdClass {
    return $gen->create_module('quiz', [
        'course' => $course->id,
        'section' => $section,
        'name' => $activity['name'],
        'intro' => ku_value($activity, 'intro', ''),
        'introformat' => FORMAT_HTML,
        'grade' => (float)$activity['grade'],
        'questionsperpage' => 1,
        'preferredbehaviour' => 'deferredfeedback',
        'shuffleanswers' => 1,
        'attempts' => (int)ku_value($activity, 'attempts', 1),
        'timelimit' => (int)ku_value($activity, 'timelimit', 0),
        'timeclose' => (int)ku_value($activity, 'timeclose', 0),
        'timeopen' => 0,
        'navmethod' => 'free',
    ] + ku_value($activity, 'review', []));
}

/**
 * Додає випадкові слоти: по одному виклику на пару «категорія + тег», кожен дає `count` слотів.
 * Формат filtercondition — той самий, що формує вікно «Додати випадкове питання».
 *
 * @return array{added: int, slots: array}
 */
function ku_add_random_slots(stdClass $quiz, stdClass $bank, array $slots, string $quizname, ku_report $report): array {
    $structure = structure::create_for_quiz(quiz_settings::create($quiz->id));
    $added = 0;
    $described = [];
    foreach ($slots as $slot) {
        $category = ku_category_by_idnumber($bank, $slot['categoryIdnumber']);
        $tag = ku_question_tag($slot['tag']);
        if ($category === null) {
            $report->warn("{$quizname}: категорії банку {$slot['categoryIdnumber']} немає — слот пропущено");
            continue;
        }
        if ($tag === null) {
            $report->warn("{$quizname}: тега {$slot['tag']} немає в банку — слот пропущено");
            continue;
        }
        $filtercondition = ['filter' => [
            'category' => [
                'jointype' => \core_question\local\bank\condition::JOINTYPE_DEFAULT,
                'values' => [(int)$category->id],
                'filteroptions' => ['includesubcategories' => (bool)$slot['includeSubcategories']],
            ],
            'qtagids' => [
                'jointype' => \qbank_tagquestion\tag_condition::JOINTYPE_DEFAULT,
                'values' => [(int)$tag->id],
            ],
        ]];
        try {
            $structure->add_random_questions(0, (int)$slot['count'], $filtercondition);
            $added += (int)$slot['count'];
            $described[] = ['category' => $slot['categoryIdnumber'], 'tag' => $slot['tag'], 'count' => (int)$slot['count']];
        } catch (Throwable $error) {
            $report->warn("{$quizname}: слот {$slot['categoryIdnumber']}/{$slot['tag']} не додано: " . $error->getMessage());
        }
    }
    ku_finalise_quiz_grades($quiz);
    return ['added' => $added, 'slots' => $described];
}

/** Перераховує суму балів тесту і повертає максимальну оцінку до значення з плану. */
function ku_finalise_quiz_grades(stdClass $quiz): void {
    global $DB;
    $calculator = quiz_settings::create($quiz->id)->get_grade_calculator();
    $calculator->recompute_quiz_sumgrades();
    $calculator->update_quiz_maximum_grade((float)$DB->get_field('quiz', 'grade', ['id' => $quiz->id]));
}

/** Стан тесту після налаштування: слоти, фільтри, оцінки й режим перегляду — для звіту. */
function ku_quiz_state(stdClass $quiz, int $cmid): array {
    global $DB;

    $record = $DB->get_record('quiz', ['id' => $quiz->id], '*', MUST_EXIST);
    $context = context_module::instance($cmid);
    $references = $DB->get_records('question_set_references',
        ['usingcontextid' => $context->id, 'component' => 'mod_quiz', 'questionarea' => 'slot'], 'itemid');
    $filters = [];
    foreach ($references as $reference) {
        $filter = json_decode($reference->filtercondition, true)['filter'] ?? [];
        $categoryid = $filter['category']['values'][0] ?? null;
        $tagids = $filter['qtagids']['values'] ?? [];
        $filters[] = [
            'category' => $categoryid === null ? null : $DB->get_field('question_categories', 'idnumber', ['id' => $categoryid]),
            'includesubcategories' => (bool)($filter['category']['filteroptions']['includesubcategories'] ?? false),
            'tags' => array_values($DB->get_fieldset_select('tag', 'name', 'id ' . ($tagids ? 'IN (' . implode(',', array_map('intval', $tagids)) . ')' : 'IS NULL'))),
        ];
    }
    return [
        'cmid' => $cmid,
        'id' => (int)$quiz->id,
        'grade' => (float)$record->grade,
        'sumgrades' => (float)$record->sumgrades,
        'slots' => (int)$DB->count_records('quiz_slots', ['quizid' => $quiz->id]),
        'timelimit' => (int)$record->timelimit,
        'timeclose' => (int)$record->timeclose,
        'attempts' => (int)$record->attempts,
        'reviewrightanswer' => (int)$record->reviewrightanswer,
        'reviewcorrectness' => (int)$record->reviewcorrectness,
        'reviewmarks' => (int)$record->reviewmarks,
        'randomfilters' => $filters,
    ];
}
