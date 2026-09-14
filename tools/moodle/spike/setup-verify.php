<?php
// Готує чистий інстанс verify до відновлення від імені викладача (ідемпотентно):
// - користувачі teacher1 (editingteacher) і student1 (student), мова інтерфейсу uk;
// - порожні курси-цілі KU-RESTORE (основна копія без користувачів) і KU-RESTORE-USERS
//   (копія з даними користувачів - перевірка пастки з глосарієм);
// - ручне зарахування: викладач - editingteacher, студент - student.
// Запуск: php /work/spike/setup-verify.php --password=<пароль для обох користувачів>

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->libdir . '/enrollib.php');

[$options] = cli_get_params(['password' => '']);
if (strlen($options['password']) < 8) {
    cli_error('--password (min 8 chars) is required');
}

\core\session\manager::set_user(get_admin());

function spike_ensure_user(string $username, string $firstname, string $password): stdClass {
    global $DB, $CFG;
    $user = $DB->get_record('user', ['username' => $username, 'mnethostid' => $CFG->mnet_localhost_id]);
    if (!$user) {
        $id = user_create_user((object)[
            'username' => $username,
            'password' => $password,
            'firstname' => $firstname,
            'lastname' => 'SPIKE',
            'email' => $username . '@example.com',
            'lang' => 'uk',
            'auth' => 'manual',
            'confirmed' => 1,
            'mnethostid' => $CFG->mnet_localhost_id,
        ], true, false);
        $user = $DB->get_record('user', ['id' => $id], '*', MUST_EXIST);
    } else {
        update_internal_user_password($user, $password);
        $DB->set_field('user', 'lang', 'uk', ['id' => $user->id]);
    }
    return $user;
}

function spike_ensure_course(string $shortname, string $fullname): stdClass {
    global $DB;
    $course = $DB->get_record('course', ['shortname' => $shortname]);
    if ($course) {
        return $course;
    }
    return create_course((object)[
        'fullname' => $fullname,
        'shortname' => $shortname,
        'category' => core_course_category::get_default()->id,
        'format' => 'topics',
        'numsections' => 0,
        'lang' => 'uk',
    ]);
}

function spike_enrol(stdClass $course, stdClass $user, string $roleshortname): void {
    global $DB;
    $plugin = enrol_get_plugin('manual');
    $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual']);
    if (!$instance) {
        $plugin->add_default_instance($course);
        $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', MUST_EXIST);
    }
    $roleid = $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST);
    $plugin->enrol_user($instance, $user->id, $roleid);
}

$teacher = spike_ensure_user('teacher1', 'Викладач', $options['password']);
$student = spike_ensure_user('student1', 'Студент', $options['password']);

$result = ['teacherid' => (int)$teacher->id, 'studentid' => (int)$student->id, 'courses' => []];
foreach (['KU-RESTORE' => 'КУ: відновлення без користувачів', 'KU-RESTORE-USERS' => 'КУ: відновлення копії з користувачами'] as $shortname => $fullname) {
    $course = spike_ensure_course($shortname, $fullname);
    spike_enrol($course, $teacher, 'editingteacher');
    spike_enrol($course, $student, 'student');
    $context = context_course::instance($course->id);
    $result['courses'][$shortname] = [
        'id' => (int)$course->id,
        'contextid' => (int)$context->id,
        'teacherIsEditing' => user_has_role_assignment($teacher->id,
            $DB->get_field('role', 'id', ['shortname' => 'editingteacher']), $context->id),
        'teacherHasRestoreUserinfo' => has_capability('moodle/restore:userinfo', $context, $teacher),
        'teacherIsSiteAdmin' => is_siteadmin($teacher),
    ];
}
cli_writeln(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
