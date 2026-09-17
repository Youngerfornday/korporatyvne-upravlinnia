<?php
// Підняття id-послідовностей сайту збирання перед створенням будь-чого.

defined('MOODLE_INTERNAL') || die();

/**
 * Мінімальне значення всіх послідовностей id на сайті збирання.
 * Менше за 2^31, тож лишається в межах 32-бітного цілого; реальні сайти Moodle цього порогу не досягають.
 */
const KU_ID_FLOOR = 900000000;

/**
 * Піднімає всі послідовності таблиць Moodle (PostgreSQL) до KU_ID_FLOOR.
 *
 * Навіщо: у Moodle 5.2.2 відновлення щонайменше в трьох місцях змішує СТАРИЙ id з копії з НОВИМ id
 * сайту-цілі (теги питань у mod_qbank, категорії банку в контексті тесту, фільтр тегу випадкового слота).
 * Збіг можливий, лише коли діапазони старих і нових id перетинаються — типово на двох свіжих сайтах.
 * Великі id на сайті збирання усувають перетин і роблять перевірку відновлення чесною.
 * Докладно — tools/moodle/README.md, розділ «Знайдені дефекти відновлення в Moodle 5.2.2».
 *
 * @return array<string, int> лише змінені послідовності
 */
function ku_raise_id_sequences(int $floor = KU_ID_FLOOR): array {
    global $DB, $CFG;

    if ($DB->get_dbfamily() !== 'postgres') {
        throw new moodle_exception('ku: підняття id-послідовностей реалізовано лише для PostgreSQL');
    }
    $sequences = $DB->get_fieldset_sql(
        "SELECT sequence_name FROM information_schema.sequences
          WHERE sequence_schema = current_schema() AND sequence_name LIKE ?",
        [$DB->sql_like_escape($CFG->prefix) . '%']
    );
    $raised = [];
    foreach ($sequences as $sequence) {
        if (!preg_match('/^[a-z0-9_]+$/', $sequence)) {
            continue;
        }
        $last = (int)$DB->get_field_sql("SELECT last_value FROM {$sequence}");
        if ($last < $floor) {
            $DB->execute("SELECT setval('{$sequence}', {$floor}, true)");
            $raised[$sequence] = $floor;
        }
    }
    return $raised;
}
