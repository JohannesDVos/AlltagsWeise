import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true, mode:0o700});
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
    if (version > 1) throw new Error('Datenbank wurde mit einer neueren Version erstellt.');
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
    db.exec('COMMIT');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
