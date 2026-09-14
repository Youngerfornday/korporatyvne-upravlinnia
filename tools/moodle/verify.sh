#!/usr/bin/env bash
# Повний прогін спайку від нуля:
#   образ -> чисті інстанси build і verify (uk) -> ZIP-фікстури -> build-spike.php -> 2 резервні копії
#   -> користувачі verify -> Playwright (відновлення від викладача + перевірки курсу)
#   -> контрольні CLI-відновлення -> зведення в out/verify-summary.txt -> зупинка контейнерів.
#
# ./verify.sh                 повний прогін з видаленням .data/ і out/ (≈3-5 хв на Apple Silicon, з них ~1,5 хв інсталяція Moodle)
# ./verify.sh --keep-data     без перевстановлення Moodle (лише для налагодження: verify вже не «чистий»)
# ./verify.sh --leave-running не зупиняти контейнери наприкінці
# SPIKE_NO_ID_FLOOR=1 ./verify.sh   збирання без підняття id-послідовностей: відтворює колізії id при відновленні
# Каталог out/evidence/ (збережені докази попередніх прогонів) скидання не чіпає.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

keep_data=false
leave_running=false
for arg in "$@"; do
  case "$arg" in
    --keep-data) keep_data=true ;;
    --leave-running) leave_running=true ;;
    *) echo "Невідомий параметр: $arg" >&2; exit 2 ;;
  esac
done

OUT="$MOODLE_DIR/out"
SUMMARY="$OUT/verify-summary.txt"
ensure_env verify
USER_PASS="$(grep '^SPIKE_USER_PASS=' "$MOODLE_DIR/env/verify.env" | cut -d= -f2-)"
started=$(date +%s)

stamp() { echo "[$(date +%H:%M:%S)] $*"; }
elapsed() { echo $(( $(date +%s) - $1 )); }

if [ "$keep_data" = false ]; then
  stamp "Скидання інстансів і результатів"
  "$MOODLE_DIR/down.sh" all --purge
  find "$OUT" -mindepth 1 -maxdepth 1 ! -name evidence -exec rm -rf {} + 2>/dev/null || true
fi
mkdir -p "$OUT"
exec > >(tee "$OUT/verify-run.log") 2>&1

stamp "1. Образ ku-moodle:5.2.2"
dc build build moodle

stamp "2. Інстанси build і verify + мовний пакет uk"
t=$(date +%s)
"$MOODLE_DIR/up.sh" all
up_seconds=$(elapsed "$t")

stamp "3. ZIP-фікстури"
"$MOODLE_DIR/fixtures/make-zips.sh"

stamp "4. Збирання курсу (build-spike.php)"
t=$(date +%s)
build_args=()
if [ "${SPIKE_NO_ID_FLOOR:-0}" = "1" ]; then
  build_args+=(--no-id-floor)
fi
moodle_php build /work/spike/build-spike.php ${build_args[@]+"${build_args[@]}"} > "$OUT/build-spike.log"
build_seconds=$(elapsed "$t")
tail -n 1 "$OUT/build-spike.log"

stamp "5. Резервні копії (admin/cli/backup.php)"
"$MOODLE_DIR/backup.sh" KU-SPIKE 0 ku-spike-nousers.mbz | tee "$OUT/backup.log"
"$MOODLE_DIR/backup.sh" KU-SPIKE 1 ku-spike-users.mbz | tee -a "$OUT/backup.log"
moodle_php build /var/www/html/admin/cli/cfg.php --component=backup --name=backup_general_users --set=0

stamp "6. Користувачі й порожні курси у verify"
moodle_php verify /work/spike/setup-verify.php --password="$USER_PASS" > "$OUT/setup-verify.json"

stamp "7. Playwright: відновлення від викладача і перевірки курсу"
(cd "$MOODLE_DIR/e2e" && npm ci --no-audit --no-fund >/dev/null && npx playwright install chromium >/dev/null)
set +e
(cd "$MOODLE_DIR/e2e" && npx playwright test tests/01-restore-as-teacher.spec.mjs tests/02-restored-course.spec.mjs)
playwright_rc=$?
set -e

stamp "8. Контрольні CLI-відновлення"
moodle_php verify /work/spike/restore-cli.php --file=/work/out/ku-spike-users.mbz \
  --shortname=KU-CLI-ADMIN-USERS --username=admin > "$OUT/control-admin-restore-users.json"
moodle_php verify /work/spike/restore-cli.php --file=/work/out/ku-spike-nousers.mbz \
  --shortname=KU-CLI-TEACHER --username=teacher1 > "$OUT/control-teacher-cli-restore.json"

stamp "9. Зведення"
{
  echo "Moodle: $(grep -m1 '"moodle"' "$OUT/spike-build.json" | cut -d'"' -f4)"
  echo "Встановлення обох інстансів (up.sh): ${up_seconds}s"
  echo "build-spike.php: ${build_seconds}s (власний замір скрипта: $(grep '"totalseconds"' "$OUT/spike-build.json" | tr -dc '0-9.')s)"
  grep 'BACKUP OK' "$OUT/backup.log"
  echo "Playwright exit code: $playwright_rc (деталі: out/playwright-report.json, скріншоти: out/screens/)"
  echo "Контроль, адміністратор + копія з користувачами, записів глосарію: $(grep '"glossaryentries"' "$OUT/control-admin-restore-users.json" | tr -dc '0-9')"
  echo "Контроль, викладач CLI + копія без користувачів, записів глосарію: $(grep '"glossaryentries"' "$OUT/control-teacher-cli-restore.json" | tr -dc '0-9')"
  echo "Загальний час прогону: $(elapsed "$started")s"
} | tee "$SUMMARY"

if [ "$leave_running" = false ]; then
  stamp "Зупинка контейнерів (дані й образи лишаються)"
  "$MOODLE_DIR/down.sh" all
fi

exit "$playwright_rc"
