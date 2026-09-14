#!/usr/bin/env bash
# Спільні функції для up.sh, down.sh, verify.sh. Підключається через source.
set -euo pipefail

MOODLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOODLE_INSTANCES=(build verify)

# Перевіряє, що ім'я інстансу відоме, інакше завершує роботу.
require_instance() {
  local instance="$1"
  case "$instance" in
    build|verify) ;;
    *) echo "Невідомий інстанс: $instance (очікується build або verify)" >&2; exit 2 ;;
  esac
}

# Розгортає аргумент all у список інстансів.
expand_instances() {
  local arg="${1:-all}"
  if [ "$arg" = "all" ]; then
    echo "${MOODLE_INSTANCES[@]}"
  else
    require_instance "$arg"
    echo "$arg"
  fi
}

# Створює env/<інстанс>.env із шаблону .env.example, замінюючи __GENERATE__ випадковими паролями.
# Файли з паролями не комітяться (.gitignore); наявний файл не перезаписується, бо пароль БД уже записано в .data.
ensure_env() {
  local instance="$1"
  local target="$MOODLE_DIR/env/$instance.env"
  [ -f "$target" ] && return 0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == *=__GENERATE__ ]]; then
      echo "${line%__GENERATE__}$(openssl rand -hex 16)"
    else
      echo "$line"
    fi
  done < "$target.example" > "$target"
  chmod 600 "$target"
}

# docker compose з env-файлом інстансу.
dc() {
  local instance="$1"; shift
  ensure_env "$instance"
  docker compose --project-directory "$MOODLE_DIR" -f "$MOODLE_DIR/compose.yaml" \
    --env-file "$MOODLE_DIR/env/$instance.env" "$@"
}

# PHP CLI всередині контейнера Moodle від імені користувача веб-сервера.
moodle_php() {
  local instance="$1"; shift
  dc "$instance" exec -T moodle php "$@"
}

# Чекає, доки контейнер Moodle стане healthy (інсталяція при першому старті ~3-6 хв).
wait_healthy() {
  local instance="$1"
  local timeout_s="${2:-1200}"
  local cid status waited=0
  cid="$(dc "$instance" ps -q moodle)"
  while :; do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo missing)"
    if [ "$status" = "healthy" ]; then
      echo "[$instance] healthy after ${waited}s"
      return 0
    fi
    if [ "$waited" -ge "$timeout_s" ]; then
      echo "[$instance] not healthy after ${timeout_s}s (status: $status)" >&2
      dc "$instance" logs --tail 80 moodle >&2
      return 1
    fi
    sleep 10
    waited=$((waited + 10))
  done
}
