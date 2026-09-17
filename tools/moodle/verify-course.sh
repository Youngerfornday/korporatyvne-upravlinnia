#!/usr/bin/env bash
# Перевірка зібраного пакета: чистий інстанс verify -> відновлення .mbz ВІД ІМЕНІ ВИКЛАДАЧА через веб
# -> скриптові перевірки Playwright у відновленому курсі -> out/build-verify.json і скріншоти out/screens.
#
# ./verify-course.sh                    перевірити найсвіжіший .mbz з dist-export/moodle
# ./verify-course.sh --mbz <файл>       перевірити конкретний пакет
# ./verify-course.sh --keep-data        не скидати інстанс verify (швидше, але курс-ціль уже не «чистий»)
# ./verify-course.sh --leave-running    не зупиняти контейнери наприкінці
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPO_ROOT="$(cd "$MOODLE_DIR/../.." && pwd)"
OUT="$MOODLE_DIR/out"
CONTAINER_DIR=/tmp/ku-verify
TARGET_SHORTNAME=KU-COURSE

mbz=""
keep_data=false
leave_running=false
while [ $# -gt 0 ]; do
  case "$1" in
    --mbz) mbz="${2:?--mbz потребує файлу}"; shift 2 ;;
    --keep-data) keep_data=true; shift ;;
    --leave-running) leave_running=true; shift ;;
    *) echo "Невідомий параметр: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$mbz" ]; then
  # Найсвіжіший за часом зміни: у каталозі можуть лежати обидва варіанти пакета (control і training).
  mbz="$(ls -1t "$REPO_ROOT"/dist-export/moodle/*.mbz 2>/dev/null | head -n 1)"
fi
if [ -z "$mbz" ] || [ ! -f "$mbz" ]; then
  echo "Немає пакета .mbz — спершу tools/moodle/build-mbz.sh" >&2
  exit 1
fi

stamp() { echo "[$(date +%H:%M:%S)] $*"; }
started=$(date +%s)
mkdir -p "$OUT"

ensure_env verify
USER_PASS="$(grep '^SPIKE_USER_PASS=' "$MOODLE_DIR/env/verify.env" | cut -d= -f2-)"
if [ -z "$USER_PASS" ]; then
  echo "У env/verify.env немає SPIKE_USER_PASS" >&2
  exit 1
fi

if [ "$keep_data" = false ]; then
  stamp "1. Чистий інстанс verify"
  "$MOODLE_DIR/down.sh" verify --purge
else
  stamp "1. Інстанс verify без скидання (--keep-data)"
fi
"$MOODLE_DIR/up.sh" verify

stamp "2. Користувачі й порожній курс-ціль"
dc verify exec -T -u root moodle sh -c "rm -rf $CONTAINER_DIR && mkdir -p $CONTAINER_DIR"
dc verify cp "$MOODLE_DIR/course-helper.php" "moodle:$CONTAINER_DIR/course-helper.php"
moodle_php verify "$CONTAINER_DIR/course-helper.php" setup \
  --password="$USER_PASS" --shortname="$TARGET_SHORTNAME" > "$OUT/verify-setup-course.json"

stamp "3. Playwright: відновлення викладачем і перевірки курсу"
(cd "$MOODLE_DIR/e2e" && npm ci --no-audit --no-fund >/dev/null && npx playwright install chromium >/dev/null)
set +e
(cd "$MOODLE_DIR/e2e" && KU_MBZ="$mbz" KU_TARGET_SHORTNAME="$TARGET_SHORTNAME" \
  npx playwright test --config playwright.course.config.mjs)
playwright_rc=$?
set -e

stamp "4. Зведення"
{
  echo "Пакет: $(basename "$mbz") ($(wc -c < "$mbz" | tr -d ' ') байт)"
  echo "Playwright exit code: $playwright_rc"
  echo "Звіт: out/build-verify.json, скріншоти: out/screens/"
  echo "Час перевірки: $(( $(date +%s) - started )) с"
} | tee "$OUT/build-verify-summary.txt"

if [ "$leave_running" = false ]; then
  stamp "Зупинка контейнерів (дані й образи лишаються)"
  "$MOODLE_DIR/down.sh" all
fi

exit "$playwright_rc"
