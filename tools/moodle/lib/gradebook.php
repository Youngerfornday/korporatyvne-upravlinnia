<?php
// Журнал оцінок: середнє зважене на рівні курсу, категорії з вагами, підсумок 0..100.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/grade/grade_category.php');
require_once($CFG->libdir . '/grade/grade_item.php');

/**
 * Налаштовує журнал: «Середнє зважене» на рівні курсу, підсумок 0..100, порожні оцінки рахуються як 0
 * (накопичувальна 100-бальна шкала університету). Кожна категорія має явну вагу; вага 0 виводить її з підсумку.
 *
 * @param array $categories [['name' => ..., 'weight' => ..., 'items' => [[modname, instanceid], ...]], ...]
 * @return array звіт по категоріях
 */
function ku_setup_gradebook(stdClass $course, array $categories, ku_report $report): array {
    $coursecategory = grade_category::fetch_course_category($course->id);
    $coursecategory->aggregation = GRADE_AGGREGATE_WEIGHTED_MEAN;
    $coursecategory->aggregateonlygraded = 0;
    $coursecategory->update();

    $courseitem = $coursecategory->load_grade_item();
    $courseitem->grademax = 100;
    $courseitem->grademin = 0;
    $courseitem->update();

    $result = [];
    foreach ($categories as $spec) {
        $category = new grade_category([
            'courseid' => $course->id,
            'fullname' => $spec['name'],
            'aggregation' => GRADE_AGGREGATE_SUM,
            'aggregateonlygraded' => 0,
        ], false);
        $category->insert();
        $category->set_parent($coursecategory->id);

        $categoryitem = $category->load_grade_item();
        $categoryitem->aggregationcoef = (float)$spec['weight'];
        $categoryitem->update();

        $moved = 0;
        foreach ($spec['items'] as [$modname, $instanceid]) {
            $item = grade_item::fetch([
                'courseid' => $course->id,
                'itemtype' => 'mod',
                'itemmodule' => $modname,
                'iteminstance' => $instanceid,
                'itemnumber' => 0,
            ]);
            if (!$item) {
                $report->warn("Журнал оцінок: немає елемента оцінювання для {$modname} {$instanceid} — до категорії «{$spec['name']}» не додано");
                continue;
            }
            $item->set_parent($category->id);
            $moved += 1;
        }
        $result[$spec['name']] = ['id' => (int)$category->id, 'weight' => (float)$spec['weight'], 'items' => $moved];
    }

    grade_regrade_final_grades($course->id);
    return $result;
}

/** Підсумковий стан журналу після налаштування — для звіту й порівняння після відновлення. */
function ku_gradebook_state(stdClass $course): array {
    $coursecategory = grade_category::fetch_course_category($course->id);
    $state = [
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
        $state['categories'][$category->fullname] = [
            'weight' => (float)$category->load_grade_item()->aggregationcoef,
            'items' => count($items),
            'maxsum' => array_sum(array_map(fn($item) => (float)$item->grademax, $items)),
        ];
    }
    ksort($state['categories']);
    return $state;
}
