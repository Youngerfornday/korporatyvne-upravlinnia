#!/usr/bin/env bash
# Зупиняє контейнери, не видаляючи образи й дані: ./down.sh [build|verify|all]
# Повне скидання інстансу: ./down.sh <інстанс> --purge (видаляє контейнери і .data/<інстанс>).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

instances="$(expand_instances "${1:-all}")"
purge="${2:-}"

for instance in $instances; do
  if [ "$purge" = "--purge" ]; then
    dc "$instance" down --remove-orphans
    rm -rf "$MOODLE_DIR/.data/$instance"
    echo "[$instance] контейнери й дані видалено"
  else
    dc "$instance" stop
  fi
done
