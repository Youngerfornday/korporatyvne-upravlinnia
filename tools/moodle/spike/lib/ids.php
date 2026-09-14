<?php
// Підняття id-послідовностей сайту збирання, щоб старі id у .mbz ніколи не збігалися з новими id сайту відновлення.

defined('MOODLE_INTERNAL') || die();

/**
 * Мінімальне значення всіх послідовностей id на сайті збирання.
 * Менше за 2^31, тож лишається в межах 32-бітного цілого; реальні сайти Moodle цього порогу не досягають.
 */
const SPIKE_ID_FLOOR = 900000000;

/**
 * Піднімає всі послідовності таблиць Moodle (PostgreSQL) до SPIKE_ID_FLOOR.
 *
 * Навіщо: відновлення в Moodle 5.2.2 має щонайменше три місця, де старий id із копії порівнюється або
 * змішується з НОВИМ id сайту-цілі в тій самій таблиці backup_ids_temp чи в умові UPDATE:
 *  1) restore_activity_structure_step::after_restore() оновлює tag_instance.itemid за (contextid, старий
 *     instance id) без фільтра component - теги питань у контексті банку переносяться на чуже питання;
 *  2) restore_move_module_questions_categories перезаписує parentitemid категорій новим id контексту, а далі
 *     шукає категорії за старими id контекстів - категорії банку переїжджають у контекст тесту;
 *  3) process_tag() + tag_condition::restore_filtercondition(): якщо новий id тегу збігся зі старим,
 *     відповідність не записується і фільтр тегу випадкового слота мовчки видаляється.
 * Збіг можливий, лише коли діапазони старих і нових id перетинаються (типово: два свіжі сайти).
 * Великі id на сайті збирання усувають перетин і для тестового verify, і для eln.
 *
 * @return array [назва послідовності => нове last_value] лише для змінених
 */
function spike_raise_id_sequences(int $floor = SPIKE_ID_FLOOR): array {
    global $DB, $CFG;

    if ($DB->get_dbfamily() !== 'postgres') {
        throw new moodle_exception('spike: id floor implemented for PostgreSQL only');
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
