#!/usr/bin/env bash
# Збирає резервну копію курсу .mbz для eln з наших даних:
#   npm run build -> Moodle XML питань і глосарію -> ZIP глав Книги -> пакети SCORM -> план курсу -> build-course.php
#   в інстансі build -> admin/cli/backup.php -> dist-export/moodle/<пакет>.mbz + README-import.md.
#
# ./build-mbz.sh                       контрольні банки з ../korporatyvne-upravlinnia-control (якщо є)
# ./build-mbz.sh --control <каталог>   інший каталог контрольних банків
# ./build-mbz.sh --no-control          публічний варіант: тести з тренувального банку (з попередженням)
# ./build-mbz.sh --skip-site-build     не перезбирати сайт (dist уже актуальний)
# ./build-mbz.sh --start 2026-09-01    понеділок першого навчального тижня для дат закриття тестів
# ./build-mbz.sh --leave-running       не зупиняти контейнер наприкінці
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPO_ROOT="$(cd "$MOODLE_DIR/../.." && pwd)"
BUILD_DIR="$MOODLE_DIR/out/build"
CONTAINER_DIR=/tmp/ku
EXPORT_DIR="$REPO_ROOT/dist-export/moodle"
DEFAULT_CONTROL="$REPO_ROOT/../korporatyvne-upravlinnia-control/banks/control"

control_dir=""
use_control=auto
skip_site_build=false
leave_running=false
start_date=""

while [ $# -gt 0 ]; do
  case "$1" in
    --control) control_dir="${2:?--control потребує каталогу}"; use_control=yes; shift 2 ;;
    --no-control) use_control=no; shift ;;
    --skip-site-build) skip_site_build=true; shift ;;
    --leave-running) leave_running=true; shift ;;
    --start) start_date="${2:?--start потребує дати YYYY-MM-DD}"; shift 2 ;;
    *) echo "Невідомий параметр: $1" >&2; exit 2 ;;
  esac
done

if [ "$use_control" = auto ] && [ -d "$DEFAULT_CONTROL" ]; then
  control_dir="$DEFAULT_CONTROL"
  use_control=yes
fi

stamp() { echo "[$(date +%H:%M:%S)] $*"; }
node_run() { (cd "$REPO_ROOT" && node --import ./tools/export/register-ts.mjs "$@"); }

started=$(date +%s)
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$EXPORT_DIR"

if [ "$skip_site_build" = true ]; then
  stamp "1. Збірка сайту пропущена (--skip-site-build)"
else
  stamp "1. Збірка сайту (npm run build)"
  (cd "$REPO_ROOT" && npm run build >"$MOODLE_DIR/out/site-build.log" 2>&1) \
    || { echo "npm run build впав, див. out/site-build.log" >&2; tail -n 30 "$MOODLE_DIR/out/site-build.log" >&2; exit 1; }
fi

stamp "2. Moodle XML: тренувальні банки і глосарій"
node_run tools/export/cli.ts --out "$BUILD_DIR" || echo "  увага: тренувальних банків немає або вони не пройшли валідацію"

if [ "$use_control" = yes ]; then
  stamp "3. Moodle XML: контрольні банки з $control_dir"
  # Окремий каталог: експортер перед записом прибирає власні файли в каталозі призначення,
  # тож спільний каталог стер би тренувальні файли з кроку 2. Пули модульних і підсумкового
  # тестів експортер розводить сам (корені категорій ct і ct-final).
  node_run tools/export/cli.ts --banks "$control_dir" --out "$BUILD_DIR/control-banks" \
    || { echo "  увага: контрольні банки не експортовано — тести будуть з тренувального банку" >&2; rm -rf "$BUILD_DIR/control-banks"; }
else
  stamp "3. Контрольні банки пропущено (--no-control)"
fi

stamp "4. ZIP глав Книги з dist/"
node_run tools/export/book-cli.ts --out "$BUILD_DIR/books"

stamp "4a. Пакети SCORM 1.2 тренажерів"
node_run tools/export/scorm/cli.ts --out "$BUILD_DIR/scorm"

stamp "5. План курсу"
plan_args=(--artifacts "$BUILD_DIR")
[ -n "$start_date" ] && plan_args+=(--start "$start_date")
node_run tools/moodle/build-plan.mjs ${plan_args[@]+"${plan_args[@]}"} | tee "$MOODLE_DIR/out/build-plan.log"

stamp "6. Інстанс build"
"$MOODLE_DIR/up.sh" build

stamp "7. Збирання курсу в Moodle"
# Файли кладе docker cp від root, тому і прибирає їх root, а не користувач веб-сервера.
dc build exec -T -u root moodle sh -c "rm -rf $CONTAINER_DIR && mkdir -p $CONTAINER_DIR"
dc build cp "$MOODLE_DIR/build-course.php" "moodle:$CONTAINER_DIR/build-course.php"
dc build cp "$MOODLE_DIR/lib" "moodle:$CONTAINER_DIR/lib"
moodle_php build "$CONTAINER_DIR/build-course.php" \
  --plan=/work/out/build/plan.json --artifacts=/work/out/build --out=/work/out/build-course.json \
  | tee "$MOODLE_DIR/out/build-course.log"

shortname="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).course.shortname)' "$BUILD_DIR/plan.json")"
kind="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).bank.quizKind)' "$BUILD_DIR/plan.json")"
package="korporatyvne-upravlinnia-${kind}-$(date +%Y-%m-%d).mbz"

stamp "8. Резервна копія без даних користувачів"
"$MOODLE_DIR/backup.sh" "$shortname" 0 "$package" | tee "$MOODLE_DIR/out/backup.log"

stamp "9. Пакет для викладача"
cp "$MOODLE_DIR/out/$package" "$EXPORT_DIR/$package"
glossary_file="$(node -e '
  const plan = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(plan.glossaryImport ? plan.glossaryImport.file : "");
' "$BUILD_DIR/plan.json")"
if [ -n "$glossary_file" ] && [ -f "$BUILD_DIR/$glossary_file" ]; then
  cp "$BUILD_DIR/$glossary_file" "$EXPORT_DIR/glossary.xml"
fi
node_run tools/moodle/write-readme.mjs \
  --plan "$BUILD_DIR/plan.json" --report "$MOODLE_DIR/out/build-course.json" \
  --package "$package" --out "$EXPORT_DIR/README-import.md"

if [ "$leave_running" = false ]; then
  stamp "Зупинка інстансу build (дані й образи лишаються)"
  dc build stop >/dev/null
fi

size=$(wc -c < "$EXPORT_DIR/$package" | tr -d ' ')
echo
echo "ПАКЕТ ГОТОВО: dist-export/moodle/$package (${size} байт), варіант банку: $kind"
echo "Час збирання: $(( $(date +%s) - started )) с"
