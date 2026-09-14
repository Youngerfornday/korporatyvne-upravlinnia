<?php
// Журнал оцінок: категорії з вагами і категорія тренажерів поза підсумком.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/grade/grade_category.php');
require_once($CFG->libdir . '/grade/grade_item.php');

/**
 * Налаштовує курс: «Середнє зважене» на рівні курсу, підсумок курсу 0..100, порожні оцінки
 * рахуються як 0 (накопичувальна 100-бальна шкала). Кожна категорія має явну вагу;
 * вага 0 виводить категорію з підсумку.
 *
 * @param array $categories [назва => ['weight' => float, 'items' => [[modname, instanceid], ...]]]
 * @return array звіт [назва => ['id' => int, 'weight' => float, 'items' => int]]
 */
function spike_setup_gradebook(stdClass $course, array $categories): array {
    $coursecat = grade_category::fetch_course_category($course->id);
    $coursecat->aggregation = GRADE_AGGREGATE_WEIGHTED_MEAN;
    $coursecat->aggregateonlygraded = 0;
    $coursecat->update();

    $courseitem = $coursecat->load_grade_item();
    $courseitem->grademax = 100;
    $courseitem->grademin = 0;
    $courseitem->update();

    $report = [];
    foreach ($categories as $name => $spec) {
        $category = new grade_category([
            'courseid' => $course->id,
            'fullname' => $name,
            'aggregation' => GRADE_AGGREGATE_SUM,
            'aggregateonlygraded' => 0,
        ], false);
        $category->insert();
        $category->set_parent($coursecat->id);

        $catitem = $category->load_grade_item();
        $catitem->aggregationcoef = (float)$spec['weight'];
        $catitem->update();

        foreach ($spec['items'] as [$modname, $instanceid]) {
            $item = grade_item::fetch([
                'courseid' => $course->id,
                'itemtype' => 'mod',
                'itemmodule' => $modname,
                'iteminstance' => $instanceid,
                'itemnumber' => 0,
            ]);
            if (!$item) {
                throw new moodle_exception("spike: grade item not found for {$modname} {$instanceid}");
            }
            $item->set_parent($category->id);
        }
        $report[$name] = ['id' => (int)$category->id, 'weight' => (float)$spec['weight'], 'items' => count($spec['items'])];
    }

    grade_regrade_final_grades($course->id);
    return $report;
}
