<?php
// Налаштування сайту після старту контейнера (ідемпотентно).
// Запуск: php /work/spike/setup-site.php
// - встановлює український мовний пакет через tool_langimport (той самий код, що й сторінка
//   «Мовні пакети» в адмінці; пакет завантажується з download.moodle.org);
// - робить uk мовою сайту за замовчуванням, як на eln.

define('CLI_SCRIPT', true);

require('/var/www/html/config.php');
require_once($CFG->libdir . '/clilib.php');

const SPIKE_LANG = 'uk';

$controller = new \tool_langimport\controller();
$installed = get_string_manager()->get_list_of_translations(true);

if (!array_key_exists(SPIKE_LANG, $installed)) {
    cli_writeln('Installing language pack: ' . SPIKE_LANG);
    \core_php_time_limit::raise();
    $count = $controller->install_languagepacks(SPIKE_LANG);
    if ($count < 1) {
        cli_error('Language pack ' . SPIKE_LANG . ' was not installed: ' . implode('; ', $controller->errors));
    }
    get_string_manager()->reset_caches();
} else {
    cli_writeln('Language pack already installed: ' . SPIKE_LANG);
}

$translations = get_string_manager()->get_list_of_translations(true);
if (!array_key_exists(SPIKE_LANG, $translations)) {
    cli_error('Language pack ' . SPIKE_LANG . ' is still missing after installation');
}

set_config('lang', SPIKE_LANG);
// Локальний стенд без пошти: вимикаємо відправлення листів (інакше помилки SMTP у виводі CLI).
set_config('noemailever', 1);
// Вимикаємо ознайомчі тури інтерфейсу: вони перекривають сторінки на скріншотах перевірок.
$DB->set_field('tool_usertours_tours', 'enabled', 0);
\cache::make('tool_usertours', 'tourdata')->purge();
// Адміністратор залишається англомовним: так простіше читати вивід CLI-скриптів.
$admin = get_admin();
$DB->set_field('user', 'lang', 'en', ['id' => $admin->id]);

$decsep = get_string_manager()->get_string('decsep', 'langconfig', null, SPIKE_LANG);
cli_writeln(sprintf('OK: site lang=%s, uk decsep="%s", release=%s', $CFG->lang, $decsep, $CFG->release));
