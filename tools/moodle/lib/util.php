<?php
// Службові функції збирання курсу: журнал кроків із заміром часу, попередження, файли в чернетках,
// перехоплення HTML-виводу імпортерів Moodle.

defined('MOODLE_INTERNAL') || die();

/**
 * Накопичувач попереджень: усе, чого ще немає в контенті або що Moodle зробив не так,
 * як просив план, потрапляє сюди і у звіт, а не зупиняє збірку.
 */
class ku_report {
    /** @var array<string, float> */
    public array $timings = [];
    /** @var string[] */
    public array $warnings = [];
    /** @var string[] */
    public array $phpwarnings = [];

    public function warn(string $message): void {
        $this->warnings[] = $message;
        cli_writeln('  увага: ' . $message);
    }

    /**
     * Виконує крок збирання із заміром часу.
     *
     * @param string $label назва кроку
     * @param callable $step крок без аргументів
     * @return mixed результат кроку
     */
    public function step(string $label, callable $step) {
        $start = microtime(true);
        cli_write(str_pad($label, 52, '.') . ' ');
        $result = $step();
        $elapsed = round(microtime(true) - $start, 2);
        $this->timings[$label] = $elapsed;
        cli_writeln("ok ({$elapsed}s)");
        return $result;
    }

    /** Перехоплює попередження PHP у звіт: мовчазні помилки імпорту мають бути видимі. */
    public function capture_php_warnings(): void {
        set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline): bool {
            $this->phpwarnings[] = sprintf('%d: %s at %s:%d', $errno, $errstr, str_replace('/var/www/html/', '', $errfile), $errline);
            return true;
        });
    }
}

/**
 * Кладе локальний файл у чернетку поточного користувача (як filepicker у формі модуля):
 * генератори Moodle приймають ZIP лише як draft item або файл усередині dirroot.
 *
 * @return array{0: int, 1: stored_file}
 */
function ku_file_to_draft(string $path): array {
    global $USER;

    if (!is_readable($path)) {
        throw new moodle_exception('filenotfound', 'error', '', null, $path);
    }
    $draftitemid = file_get_unused_draft_itemid();
    $file = get_file_storage()->create_file_from_pathname([
        'contextid' => context_user::instance($USER->id)->id,
        'component' => 'user',
        'filearea' => 'draft',
        'itemid' => $draftitemid,
        'filepath' => '/',
        'filename' => basename($path),
    ], $path);
    return [$draftitemid, $file];
}

/**
 * Виконує функцію, перехоплюючи HTML-вивід: імпортери Moodle друкують повідомлення напряму в потік.
 *
 * @return array{0: mixed, 1: string}
 */
function ku_capture_output(callable $fn): array {
    ob_start();
    try {
        $result = $fn();
    } finally {
        $output = ob_get_clean();
    }
    return [$result, $output];
}

/** HTML-вивід Moodle → короткий текст для звіту. */
function ku_html_to_text(string $html): string {
    $text = html_entity_decode(strip_tags(str_replace(['<br', '</p>', '</div>', '<hr'], ["\n<br", "</p>\n", "</div>\n", "\n<hr"], $html)));
    return trim(preg_replace("/\n\s*\n+/", "\n", $text));
}

/** Значення з масиву плану або значення за замовчуванням: план може не мати необов'язкових полів. */
function ku_value(array $data, string $key, $default = null) {
    return array_key_exists($key, $data) ? $data[$key] : $default;
}
