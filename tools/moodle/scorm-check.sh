#!/usr/bin/env bash
# Перевірка пакета SCORM тренажера в живому Moodle 5.2.2 (інстанс verify):
#   пакети (npm run export:scorm) -> курс KU-SCORM-CHECK з користувачами (course-helper.php setup)
#   -> тренажер тим самим кодом, що й збирач курсу (scorm-helper.php add -> lib/content.php)
#   -> Playwright від імені студента: навчальна й оцінювана спроби, бал і статус у журналі,
#      вихід і повторний вхід зі станом із suspend_data -> out/scorm-check.json і out/screens/scorm-check-*.png.
#
# ./scorm-check.sh                     пакет П1 «Матриця моделей»
# ./scorm-check.sh --zip <пакет.zip>   інший пакет матриці
# ./scorm-check.sh --leave-running     не зупиняти контейнери наприкінці
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPO_ROOT="$(cd "$MOODLE_DIR/../.." && pwd)"
OUT="$MOODLE_DIR/out"
WORK="$OUT/scorm-check"
CONTAINER_DIR=/tmp/ku-scorm
SHORTNAME=KU-SCORM-CHECK
PACKAGE_ID=p01-matrytsia-modelei

zip=""
leave_running=false
while [ $# -gt 0 ]; do
  case "$1" in
    --zip) zip="${2:?--zip потребує файлу}"; shift 2 ;;
    --leave-running) leave_running=true; shift ;;
    *) echo "Невідомий параметр: $1" >&2; exit 2 ;;
  esac
done

stamp() { echo "[$(date +%H:%M:%S)] $*"; }
started=$(date +%s)
rm -rf "$WORK"
mkdir -p "$WORK"

if [ -z "$zip" ]; then
  stamp "1. Пакети SCORM (npm run export:scorm)"
  (cd "$REPO_ROOT" && node --import ./tools/export/register-ts.mjs tools/export/scorm/cli.ts --out "$WORK/packages")
  zip="$WORK/packages/$PACKAGE_ID.zip"
else
  stamp "1. Пакет $zip"
fi
cp "$zip" "$WORK/package.zip"
mastery="$(node -e '
  const fs = require("fs");
  const index = process.argv[1];
  const entry = fs.existsSync(index) ? JSON.parse(fs.readFileSync(index, "utf8")).packages.find((p) => p.id === process.argv[2]) : null;
  process.stdout.write(entry ? String(entry.masteryPercent) : "");
' "$WORK/packages/scorm.json" "$PACKAGE_ID")"

ensure_env verify
USER_PASS="$(grep '^SPIKE_USER_PASS=' "$MOODLE_DIR/env/verify.env" | cut -d= -f2-)"

stamp "2. Інстанс verify"
"$MOODLE_DIR/up.sh" verify

stamp "3. Курс $SHORTNAME, користувачі й тренажер"
dc verify exec -T -u root moodle sh -c "rm -rf $CONTAINER_DIR && mkdir -p $CONTAINER_DIR"
dc verify cp "$MOODLE_DIR/course-helper.php" "moodle:$CONTAINER_DIR/course-helper.php"
dc verify cp "$MOODLE_DIR/scorm-helper.php" "moodle:$CONTAINER_DIR/scorm-helper.php"
dc verify cp "$MOODLE_DIR/lib" "moodle:$CONTAINER_DIR/lib"
moodle_php verify "$CONTAINER_DIR/course-helper.php" setup --password="$USER_PASS" --shortname="$SHORTNAME" > "$WORK/setup.json"
moodle_php verify "$CONTAINER_DIR/scorm-helper.php" add --shortname="$SHORTNAME" \
  --zip=/work/out/scorm-check/package.zip --name="П1. Матриця моделей корпоративного управління (SCORM)" --mastery="$mastery" \
  > "$WORK/add.json"
cat "$WORK/add.json"

stamp "4. Playwright: спроба студента, журнал оцінок, повторний вхід"
(cd "$MOODLE_DIR/e2e" && npm ci --no-audit --no-fund >/dev/null && npx playwright install chromium >/dev/null)
set +e
(cd "$MOODLE_DIR/e2e" && KU_SCORM_SHORTNAME="$SHORTNAME" npx playwright test --config playwright.scorm.config.mjs)
playwright_rc=$?
set -e

stamp "Звіт: out/scorm-check.json, скріншоти: out/screens/scorm-check-*.png ($(( $(date +%s) - started )) с, Playwright $playwright_rc)"

if [ "$leave_running" = false ]; then
  stamp "Зупинка контейнерів (дані й образи лишаються)"
  "$MOODLE_DIR/down.sh" all
fi

exit "$playwright_rc"
