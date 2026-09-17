<?php
// Допоміжний CLI перевірки SCORM-тренажера в інстансі verify. Друкує JSON.
//   php scorm-helper.php add --shortname=KU-SCORM-CHECK --zip=<пакет.zip> --name=<назва> [--mastery=90]
//   php scorm-helper.php report --shortname=KU-SCORM-CHECK --username=student1
//
// add бере курс, який підготував course-helper.php setup (користувачі й зарахування), і додає тренажер тим самим
// кодом, що й збирач курсу (lib/content.php → ku_create_scorm), плюс категорію журналу «Тренажери» з вагою 0.
// report — спроби, треки SCORM (бал, статус, suspend_data, час) і оцінки в журналі для користувача.

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->dirroot . '/mod/scorm/locallib.php');
require_once(__DIR__ . '/lib/util.php');
require_once(__DIR__ . '/lib/content.php');
require_once(__DIR__ . '/lib/gradebook.php');

$command = $argv[1] ?? '';
[$options] = cli_get_params([
    'shortname' => 'KU-SCORM-CHECK',
    'zip' => '',
    'name' => 'Тренажер SCORM',
    'mastery' => '',
    'username' => 'student1',
]);

\core\session\manager::set_user(get_admin());

const KU_SCORM_TRACK_ELEMENTS = [
    'cmi.core.lesson_status', 'cmi.core.score.raw', 'cmi.core.score.min', 'cmi.core.score.max',
    'cmi.core.exit', 'cmi.core.session_time', 'cmi.core.total_time', 'x.start.time',
];

function ku_scorm_helper_course(string $shortname): stdClass {
    global $DB;
    return $DB->get_record('course', ['shortname' => $shortname], '*', MUST_EXIST);
}

function ku_scorm_helper_add(stdClass $course, string $zip, string $name, string $mastery): array {
    global $DB;
    $report = new ku_report();
    $DB->set_field('course', 'fullname', 'Перевірка SCORM-тренажера', ['id' => $course->id]);
    $activity = ['name' => $name, 'intro' => '<p>Перевірка пакета SCORM 1.2 тренажера.</p>', 'maxgrade' => 100];
    if ($mastery !== '') {
        $activity['masteryPercent'] = (float)$mastery;
    }
    [$scorm] = ku_capture_output(fn() => ku_create_scorm(\core\test\phpunit\phpunit_util::get_data_generator(), $course, 0, $activity, $zip, $report));
    $gradebook = ku_setup_gradebook($course, [['name' => 'Тренажери (поза підсумком)', 'weight' => 0, 'items' => [['scorm', $scorm->id]]]], $report);
    rebuild_course_cache($course->id, true);
    $sco = $DB->get_record_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$scorm->id], '*', MUST_EXIST);
    return [
        'courseid' => (int)$course->id,
        'cmid' => $scorm->cmid,
        'scormid' => $scorm->id,
        'scoid' => (int)$sco->id,
        'launch' => $sco->launch,
        'version' => $scorm->version,
        'masteryscore' => $scorm->masteryscore,
        'settings' => $DB->get_record('scorm', ['id' => $scorm->id], 'grademethod, maxgrade, whatgrade, maxattempt, forcenewattempt, masteryoverride, skipview, hidetoc, popup'),
        'gradebook' => $gradebook,
        'warnings' => $report->warnings,
    ];
}

function ku_scorm_helper_grade(stdClass $course, stdClass $user, ?grade_item $item): ?float {
    if ($item === null) {
        return null;
    }
    $grade = new grade_grade(['itemid' => $item->id, 'userid' => $user->id]);
    return $grade->finalgrade === null ? null : round((float)$grade->finalgrade, 2);
}

function ku_scorm_helper_report(stdClass $course, string $username): array {
    global $DB, $CFG;
    $user = $DB->get_record('user', ['username' => $username, 'mnethostid' => $CFG->mnet_localhost_id], '*', MUST_EXIST);
    $cm = get_coursemodule_from_instance('scorm', $DB->get_field('scorm', 'id', ['course' => $course->id], MUST_EXIST), $course->id, false, MUST_EXIST);
    $scorm = $DB->get_record('scorm', ['id' => $cm->instance], '*', MUST_EXIST);
    $sco = $DB->get_record_select('scorm_scoes', "scorm = ? AND scormtype = 'sco'", [$scorm->id], '*', MUST_EXIST);

    $attempts = (int)scorm_get_attempt_count($user->id, $scorm);
    $tracks = $attempts > 0 ? scorm_get_tracks($sco->id, $user->id) : false;
    $values = [];
    $suspend = null;
    if ($tracks) {
        foreach (KU_SCORM_TRACK_ELEMENTS as $element) {
            $values[$element] = $tracks->{$element} ?? null;
        }
        $raw = $tracks->{'cmi.suspend_data'} ?? null;
        $suspend = $raw === null ? null : ['length' => core_text::strlen($raw), 'compressed' => str_starts_with($raw, 'z1:'),
            'json' => str_starts_with($raw, '{') ? json_decode($raw, true) : null];
    }

    grade_regrade_final_grades($course->id);
    $item = grade_item::fetch(['courseid' => $course->id, 'itemtype' => 'mod', 'itemmodule' => 'scorm', 'iteminstance' => $scorm->id, 'itemnumber' => 0]) ?: null;
    return [
        'cmid' => (int)$cm->id,
        'attempts' => $attempts,
        'lastAttempt' => $attempts > 0 ? (int)scorm_get_last_attempt($scorm->id, $user->id) : null,
        'tracks' => $values,
        'suspendData' => $suspend,
        'grades' => [
            'scorm' => ku_scorm_helper_grade($course, $user, $item),
            'scormGrademax' => $item ? (float)$item->grademax : null,
            'courseTotal' => ku_scorm_helper_grade($course, $user, grade_item::fetch_course_item($course->id)),
        ],
    ];
}

$course = ku_scorm_helper_course($options['shortname']);
switch ($command) {
    case 'add':
        if (!is_readable($options['zip'])) {
            cli_error("Пакета SCORM немає або він недоступний: {$options['zip']}");
        }
        $result = ku_scorm_helper_add($course, $options['zip'], $options['name'], (string)$options['mastery']);
        break;
    case 'report':
        $result = ku_scorm_helper_report($course, $options['username']);
        break;
    default:
        cli_error('Команда: add | report');
}
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
