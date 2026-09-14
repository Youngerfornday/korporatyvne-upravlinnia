<?php
// Відновлення .mbz через restore_controller з CLI від імені заданого користувача (для контрольних експериментів).
// Створює порожній курс, зараховує користувача як editingteacher (якщо це не адміністратор)
// і відновлює копію в режимі «Злити резервну копію з цим курсом» (TARGET_CURRENT_ADDING) - як у веб-інтерфейсі.
// php restore-cli.php --file=/work/out/ku-spike-nousers.mbz --shortname=KU-CLI-1 --username=teacher1

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->libdir . '/enrollib.php');
require_once($CFG->dirroot . '/backup/util/includes/restore_includes.php');

[$options] = cli_get_params(['file' => '', 'shortname' => '', 'username' => 'admin']);
if (!is_readable($options['file']) || $options['shortname'] === '') {
    cli_error('--file (readable .mbz) and --shortname are required');
}
if ($DB->record_exists('course', ['shortname' => $options['shortname']])) {
    cli_error('Course already exists: ' . $options['shortname']);
}

\core\session\manager::set_user(get_admin());
$user = $DB->get_record('user', ['username' => $options['username'], 'deleted' => 0], '*', MUST_EXIST);

$course = create_course((object)[
    'fullname' => 'CLI restore ' . $options['shortname'],
    'shortname' => $options['shortname'],
    'category' => core_course_category::get_default()->id,
    'numsections' => 0,
]);
if (!is_siteadmin($user)) {
    $plugin = enrol_get_plugin('manual');
    $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', MUST_EXIST);
    $plugin->enrol_user($instance, $user->id, $DB->get_field('role', 'id', ['shortname' => 'editingteacher']));
}
\core\session\manager::set_user($user);

$backupdir = 'spike_' . random_string(10);
$fullpath = make_backup_temp_directory($backupdir);
get_file_packer('application/vnd.moodle.backup')->extract_to_pathname($options['file'], $fullpath);

$started = microtime(true);
$controller = new restore_controller($backupdir, $course->id, backup::INTERACTIVE_NO, backup::MODE_GENERAL,
    $user->id, backup::TARGET_CURRENT_ADDING);
$precheckok = $controller->execute_precheck();
$usersetting = $controller->get_plan()->get_setting('users');
$report = [
    'courseid' => (int)$course->id,
    'user' => $user->username,
    'precheck' => $precheckok,
    'precheckresults' => $controller->get_precheck_results(),
    'users' => ['value' => (bool)$usersetting->get_value(), 'status' => $usersetting->get_status()],
];
$controller->execute_plan();
$controller->destroy();
$report['seconds'] = round(microtime(true) - $started, 2);

$sql = "SELECT q.id, qbe.idnumber
          FROM {question} q
          JOIN {question_versions} qv ON qv.questionid = q.id
          JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
          JOIN {question_categories} qc ON qc.id = qbe.questioncategoryid
          JOIN {context} ctx ON ctx.id = qc.contextid AND ctx.contextlevel = :level
          JOIN {course_modules} cm ON cm.id = ctx.instanceid AND cm.course = :courseid
         WHERE q.parent = 0
      ORDER BY qbe.idnumber";
$tags = [];
foreach ($DB->get_records_sql($sql, ['level' => CONTEXT_MODULE, 'courseid' => $course->id]) as $q) {
    $tags[$q->idnumber] = array_values(array_map(fn($t) => $t->name,
        core_tag_tag::get_item_tags('core_question', 'question', $q->id)));
}
$report['questiontags'] = $tags;
$glossary = $DB->get_record('glossary', ['course' => $course->id]);
$report['glossaryentries'] = $glossary ? $DB->count_records('glossary_entries', ['glossaryid' => $glossary->id]) : null;
cli_writeln(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
