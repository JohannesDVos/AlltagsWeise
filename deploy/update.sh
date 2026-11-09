#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 || $1 != refs/tags/* && ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Aufruf: bash deploy/update.sh <refs/tags/Version oder vollständiger Commit>\n' >&2
  exit 2
fi
root=/opt/alltagsweise
exec 9>"$root/.update.lock"
flock -n 9
git fetch --tags origin
commit=$(git rev-parse --verify "$1^{commit}")
release=$(mktemp -d "$root/releases/${commit:0:12}.XXXXXX")
chmod 0755 "$release"
git archive "$commit" | tar -x -C "$release"
(cd "$release" && npm ci && npm run check)
previous=$(readlink -f "$root/current")
cd "$previous"
sudo systemctl stop alltagsweise.service
if ! sudo systemctl start alltagsweise-backup.service; then
  sudo systemctl start alltagsweise.service
  exit 1
fi
activate() {
  ln -sfn "$1" "$root/.next"
  mv -Tf "$root/.next" "$root/current"
}
activate "$release"
if sudo systemctl start alltagsweise.service; then
  for attempt in {1..15}; do
    if curl -fsS http://127.0.0.1:3000/health; then printf '\n'; exit 0; fi
    sleep 1
  done
fi
sudo systemctl stop alltagsweise.service
activate "$previous"
printf 'Startprüfung fehlgeschlagen. Vor Neustart die Datenbanksicherung wiederherstellen.\n' >&2
exit 1

