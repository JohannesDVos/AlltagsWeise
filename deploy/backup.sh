#!/usr/bin/env bash
set -euo pipefail
umask 077
dir=/var/lib/alltagsweise/backups
mkdir -p "$dir"
tmp=$(mktemp "$dir/.snapshot.XXXXXX")
trap 'rm -f -- "$tmp"' EXIT
node dist/server/main.js backup "$tmp"
target="$dir/$(date -u +%Y%m%dT%H%M%S)-${tmp##*.}.sqlite"
mv -- "$tmp" "$target"
find "$dir" -maxdepth 1 -type f -name '*.sqlite' -mmin +20160 -delete
printf '%s\n' "$target"
