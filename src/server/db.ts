import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true, mode:0o700});
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
    if (version > 3) throw new Error('Datenbank wurde mit einer neueren Version erstellt.');
    if (version === 0) db.exec(`
      CREATE TABLE owner (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL) STRICT;
      CREATE TABLE sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL) STRICT;
      CREATE TABLE wishes (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, link TEXT, priceCents INTEGER,
        note TEXT, fulfilled INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version=1;
    `);
    if (version < 2) db.exec(`
      CREATE TABLE school_config (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL) STRICT;
      CREATE TABLE school_tasks (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL,
        priority INTEGER NOT NULL, created_on TEXT NOT NULL, due_on TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE TABLE school_events (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL,
        event_date TEXT NOT NULL, event_type TEXT NOT NULL, notes TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version=2;
    `);
    if (version < 3) db.exec(`
      CREATE TABLE todos (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL,
        dueOn TEXT, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
      ) STRICT;
      CREATE TABLE routines (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, rhythm TEXT NOT NULL,
        day INTEGER, createdOn TEXT NOT NULL, archivedOn TEXT,
        CHECK ((rhythm='daily' AND day IS NULL)
          OR (rhythm='weekly' AND day IS NOT NULL AND day BETWEEN 1 AND 7)
          OR (rhythm='monthly' AND (day IS NULL OR day BETWEEN 1 AND 31)))
      ) STRICT;
      CREATE TABLE routine_completions (
        routineId TEXT NOT NULL REFERENCES routines(id),
        dueOn TEXT NOT NULL, PRIMARY KEY (routineId,dueOn)
      ) STRICT;
      PRAGMA user_version=3;
    `);
    db.exec('COMMIT');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
