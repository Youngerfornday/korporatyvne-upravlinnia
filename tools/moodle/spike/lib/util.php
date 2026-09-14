<?php
// Допоміжні функції спайку: журнал кроків, заміри часу, файли в чернетках користувача.

defined('MOODLE_INTERNAL') || die();

/**
 * Виконує крок збирання із заміром часу; виняток зупиняє весь скрипт.
 *
 * @param string $label назва кроку для журналу
 * @param callable $step функція без аргументів
 * @param array $timings накопичувач часу (за посиланням)
 * @return mixed результат кроку
 */
function spike_step(string $label, callable $step, array &$timings) {
    $start = microtime(true);
    cli_write(str_pad($label, 48, '.') . ' ');
    $result = $step();
    $elapsed = round(microtime(true) - $start, 2);
    $timings[$label] = $elapsed;
    cli_writeln("ok ({$elapsed}s)");
    return $result;
}

/**
 * Кладе локальний файл у чернетку поточного користувача (як це робить filepicker у формі).
 *
 * @param string $path абсолютний шлях у контейнері
 * @return array [int $draftitemid, stored_file $file]
 */
function spike_file_to_draft(string $path): array {
    global $USER;

    if (!is_readable($path)) {
        throw new moodle_exception('filenotfound', 'error', '', null, $path);
    }
    $draftitemid = file_get_unused_draft_itemid();
    $record = [
        'contextid' => context_user::instance($USER->id)->id,
        'component' => 'user',
        'filearea' => 'draft',
        'itemid' => $draftitemid,
        'filepath' => '/',
        'filename' => basename($path),
    ];
    $file = get_file_storage()->create_file_from_pathname($record, $path);
    return [$draftitemid, $file];
}

/**
 * Виконує функцію, перехоплюючи HTML-вивід (імпортери Moodle друкують повідомлення напряму).
 *
 * @param callable $fn
 * @return array [mixed $result, string $output]
 */
function spike_capture_output(callable $fn): array {
    ob_start();
    try {
        $result = $fn();
    } finally {
        $output = ob_get_clean();
    }
    return [$result, $output];
}

/**
 * Перетворює HTML-вивід Moodle на короткий текст для журналу.
 */
function spike_html_to_text(string $html): string {
    $text = html_entity_decode(strip_tags(str_replace(['<br', '</p>', '</div>', '<hr'], ["\n<br", "</p>\n", "</div>\n", "\n<hr"], $html)));
    return trim(preg_replace("/\n\s*\n+/", "\n", $text));
}
