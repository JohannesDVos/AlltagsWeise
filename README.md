# AlltagsWeise

Eine selbst gehostete Werkzeugzentrale mit privater Wunschliste. Die Oberfläche ist auf Deutsch und für Safari, Firefox und Chromium ausgelegt. Im Browser kann die Seite zum Home-Bildschirm hinzugefügt werden.

## Lokal starten

Node.js 24 ab 24.15 verwenden. Unter Windows bei Bedarf `npm.cmd` statt `npm` aufrufen.

```sh
npm ci
npm run check
npm start -- setup
npm start
```

Dann [localhost öffnen](http://localhost:3000). Lokal wird die SQLite-Datei unter `data/` angelegt. Eine eigene `.env` kann die Variablen aus `.env.example` setzen. Für Entwicklung mit Vite den Server zusätzlich mit `APP_ORIGIN=http://localhost:5173` starten.

## Raspberry Pi installieren

1. Mit `uname -m`, `cat /etc/os-release`, `node -v`, `sudo nginx -T` und `sudo ss -ltnp` Architektur, Betriebssystem, Node, Hauptdomain, Zertifikatspfade und Port 3000 prüfen. Raspberry Pi OS mit 64 Bit und Node 24 ab 24.15 unter `/usr/bin/node` verwenden. Vor der Änderung die vorhandene NGINX-Konfiguration und betroffene Dienste sichern.
2. Ein normales Administratorkonto klont das Repo in seinen eigenen Checkout. Bei privatem Repo einen geeigneten GitHub-Zugang auf dem Pi einrichten. `npm ci && npm run check` im Checkout ausführen. Dateien des geprüften Commits in ein eigenes Release-Verzeichnis unter `/opt/alltagsweise/releases` übernehmen und den Ordner `dist` aus dem geprüften Build mitkopieren. Im Release `npm ci --omit=dev` ausführen. `/opt/alltagsweise/current` als Symlink auf dieses Release anlegen. Das Deployment-Konto braucht Schreibrechte im Release-Verzeichnis und für den Symlink. Das Dienstkonto braucht dort nur Leserechte.
3. Systemkonto `alltagsweise` ohne Login anlegen und `/var/lib/alltagsweise` mit Eigentümer `alltagsweise:alltagsweise` und Modus 0700 erstellen. Als root `/etc/alltagsweise.env` mit Modus 0600 anlegen. Dort `APP_ORIGIN` auf die HTTPS-Hauptadresse setzen, `PLANNER_URL` auf die HTTPS-Adresse des bestehenden Planers, `PORT=3000` und `DATABASE_PATH=/var/lib/alltagsweise/app.sqlite` setzen. Die Beispielwerte im Repository sind fiktiv.
4. Im Release einmalig das Passwort einrichten, beispielsweise mit `sudo -u alltagsweise env DATABASE_PATH=/var/lib/alltagsweise/app.sqlite /usr/bin/node dist/server/main.js setup`. Das Passwort wird verdeckt eingegeben.
5. Die beiden Service-Dateien und den Timer aus `deploy/` nach `/etc/systemd/system/` installieren. Mit `sudo systemctl daemon-reload` neu laden und mit `sudo systemctl enable --now alltagsweise.service alltagsweise-backup.timer` aktivieren. Mit `curl -fsS http://127.0.0.1:3000/health` prüfen.
6. `deploy/nginx-location.conf` im vorhandenen HTTPS-Serverblock der Hauptdomain einbinden oder damit dessen bisherige `location /` ersetzen. Die Planer-Subdomain separat belassen. `sudo nginx -t` ausführen, anschließend NGINX neu laden und beide Adressen im Browser prüfen.

## Updates und Wiederherstellung

Aus dem Pi-Checkout als Deployment-Konto `bash deploy/update.sh refs/tags/v1.0.0` ausführen, sobald dieser Tag existiert. Alternativ den vollständigen Commit übergeben. Der Befehl baut ein neues Release, führt alle Prüfungen aus und sichert die Datenbank. Der Start führt ausstehende Migrationen aus. Bei fehlgeschlagener Startprüfung zeigt der Symlink auf das vorherige Release und der Dienst bleibt gestoppt.

Für eine Wiederherstellung App und Backup-Timer stoppen und das Ende eines gegebenenfalls laufenden Backup-Dienstes abwarten. Die aktuelle Datenbank samt vorhandenen Dateien `app.sqlite-wal` und `app.sqlite-shm` in ein separates Sicherungsverzeichnis verschieben. Einen passenden Snapshot aus `/var/lib/alltagsweise/backups/` als `app.sqlite` mit Eigentümer `alltagsweise:alltagsweise` und Modus 0600 installieren. Falls nötig den Symlink auf das zur Sicherung passende Release setzen. App und Timer starten und Health-Endpunkt sowie Anmeldung prüfen. Snapshots enthalten private Daten und Sitzungsinformationen und gehören nur in privaten Speicher. Der Timer bewahrt sie 14 Tage auf.

## Lizenz

MIT. GitHub Actions führt Typprüfung, Lint, Integrationstests und Build aus. Der Betrieb auf dem Pi wird manuell aktualisiert.
