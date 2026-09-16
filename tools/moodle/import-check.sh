#!/usr/bin/env bash
# Перевірка реального імпорту Moodle XML з tools/export у Moodle 5.2.2 (інстанс build):
#   експорт (tools/export/cli.ts) -> ./up.sh build -> import-check.php (qformat_xml з налаштуваннями спайку;
#   кількості за типами, категорії, теги, бал і повна оцінка правильної відповіді; імпорт записів глосарію)
#   -> out/import-check.json -> docker compose stop.
#
# ./import-check.sh                       фікстури tools/export/__fixtures__: усі 8 типів, 3 модулі, глосарій,
#                                         тренувальні й контрольні банки разом (перевірка розділення видів)
# ./import-check.sh --content             реальний контент (content/banks/training, content/modules)
# ./import-check.sh -- <параметри>        довільні параметри експортера, напр. -- --banks ../control/banks/control
# ./import-check.sh --leave-running       не зупиняти контейнери й лишити тестові курси KU-IMPORT-* для огляду
# Інстанс build, запущений до перевірки (іншою роботою), наприкінці не зупиняється.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPO_ROOT="$(cd "$MOODLE_DIR/../.." && pwd)"
FIXTURES="$REPO_ROOT/tools/export/__fixtures__"
XML_DIR="$MOODLE_DIR/out/import-check"
BANKS_DIR="$MOODLE_DIR/out/import-check-banks"
REPORT="$MOODLE_DIR/out/import-check.json"
CONTAINER_SCRIPT=/tmp/ku-import-check.php

leave_running=false
use_fixtures=true
export_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --leave-running) leave_running=true; shift ;;
    --content) use_fixtures=false; shift ;;
    --) shift; use_fixtures=false; export_args=("$@"); break ;;
    *) echo "Невідомий параметр: $1" >&2; exit 2 ;;
  esac
done

stamp() { echo "[$(date +%H:%M:%S)] $*"; }

# Інстанс, який уже працював до запуску (ним користується інша робота), не зупиняємо.
was_running=false
[ -n "$(dc build ps -q --status running moodle 2>/dev/null)" ] && was_running=true

stop_instance() {
  if [ "$leave_running" = false ] && [ "$was_running" = false ]; then
    stamp "Зупинка інстансу build (docker compose stop)"
    dc build stop >/dev/null 2>&1 || true
  elif [ "$was_running" = true ]; then
    stamp "Інстанс build працював до перевірки — лишаємо запущеним"
  fi
}

if [ "$use_fixtures" = true ]; then
  stamp "0. Фікстури банків: тренувальні + контрольні двійники"
  (cd "$REPO_ROOT" && node tools/export/__fixtures__/make-control-banks.mjs "$BANKS_DIR")
  export_args=(--banks "$BANKS_DIR" --modules "$FIXTURES/modules")
fi

stamp "1. Експорт Moodle XML -> ${XML_DIR#"$REPO_ROOT"/}"
rm -rf "$XML_DIR" "$REPORT"
mkdir -p "$XML_DIR"
(cd "$REPO_ROOT" && node --import ./tools/export/register-ts.mjs tools/export/cli.ts ${export_args[@]+"${export_args[@]}"} --out "$XML_DIR")

trap stop_instance EXIT

stamp "2. Інстанс build"
"$MOODLE_DIR/up.sh" build

stamp "3. Імпорт і перевірки в Moodle"
dc build cp "$MOODLE_DIR/import-check.php" "moodle:$CONTAINER_SCRIPT"
set +e
cleanup_args=(--cleanup)
[ "$leave_running" = true ] && cleanup_args=()
moodle_php build "$CONTAINER_SCRIPT" --manifest=/work/out/import-check/manifest.json \
  --out=/work/out/import-check.json ${cleanup_args[@]+"${cleanup_args[@]}"} > "$MOODLE_DIR/out/import-check.log" 2>&1
rc=$?
set -e
tail -n 1 "$MOODLE_DIR/out/import-check.log"
if [ ! -s "$REPORT" ]; then
  echo "Звіт не створено, див. out/import-check.log" >&2
  tail -n 40 "$MOODLE_DIR/out/import-check.log" >&2
  exit 1
fi
echo "Звіт: ${REPORT#"$REPO_ROOT"/}"
exit "$rc"
