#!/usr/bin/env bash
# Резервна копія курсу з інстансу build через штатний admin/cli/backup.php.
# ./backup.sh <shortname> <users:0|1> <ім'я файлу .mbz>
# backup.php не має параметра «з користувачами», тому перед запуском виставляємо
# налаштування сайту backup/backup_general_users (саме його бере backup_controller у MODE_GENERAL).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

shortname="${1:?shortname}"
users="${2:?users 0|1}"
target="${3:?target file name}"
case "$users" in 0|1) ;; *) echo "users має бути 0 або 1" >&2; exit 2 ;; esac

stage="$MOODLE_DIR/out/.backup-stage"
rm -rf "$stage" && mkdir -p "$stage"

moodle_php build /var/www/html/admin/cli/cfg.php --component=backup --name=backup_general_users --set="$users"
start=$(date +%s)
moodle_php build /var/www/html/admin/cli/backup.php --courseshortname="$shortname" --destination=/work/out/.backup-stage
elapsed=$(( $(date +%s) - start ))

produced=("$stage"/*.mbz)
if [ "${#produced[@]}" -ne 1 ] || [ ! -f "${produced[0]}" ]; then
  echo "Очікувався рівно один .mbz у $stage" >&2
  exit 1
fi
mv "${produced[0]}" "$MOODLE_DIR/out/$target"
rm -rf "$stage"
size=$(wc -c < "$MOODLE_DIR/out/$target" | tr -d ' ')
echo "BACKUP OK: out/$target users=$users size=${size} bytes time=${elapsed}s"
