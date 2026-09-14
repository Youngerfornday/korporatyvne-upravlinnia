#!/usr/bin/env bash
# Піднімає Moodle-інстанси: ./up.sh [build|verify|all]
# Після старту встановлює український мовний пакет (ідемпотентно).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

instances="$(expand_instances "${1:-all}")"

for instance in $instances; do
  mkdir -p "$MOODLE_DIR/.data/$instance/postgres" "$MOODLE_DIR/.data/$instance/moodledata"
  dc "$instance" up -d
done
mkdir -p "$MOODLE_DIR/out"

for instance in $instances; do
  wait_healthy "$instance"
  moodle_php "$instance" /work/spike/setup-site.php
done
