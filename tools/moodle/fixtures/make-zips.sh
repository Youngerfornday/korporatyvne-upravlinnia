#!/usr/bin/env bash
# Пакує джерела фікстур у ZIP: book.zip (глави Книги + SVG) і scorm12.zip (SCO).
# Порядок файлів і часові мітки фіксовані, щоб архів був відтворюваним.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

pack() {
  local src="$1" out="$2"
  rm -f "$out"
  (cd "$src" && find . -type f ! -name '.DS_Store' | LC_ALL=C sort | sed 's|^\./||' \
    | TZ=UTC xargs touch -t 202601010000 && find . -type f ! -name '.DS_Store' | LC_ALL=C sort | sed 's|^\./||' \
    | zip -X -q "../$out" -@)
  echo "$out: $(wc -c < "$out" | tr -d ' ') bytes"
}

pack book-src book.zip
pack scorm12-src scorm12.zip
