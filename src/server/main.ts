import { fileURLToPath } from 'node:url';
import { backup } from 'node:sqlite';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { openDatabase } from './db.js';
import { hashPassword } from './auth.js';
import { createApp } from './app.js';

async function main() {
  process.umask(0o077);
  const db = openDatabase(process.env.DATABASE_PATH ?? 'data/app.sqlite');
  try {
    const [command, destination] = process.argv.slice(2);
    if (command === 'setup') {
      if (db.prepare('SELECT 1 FROM owner').get()) throw new Error('Besitzerkonto existiert bereits.');
      if (!process.stdin.isTTY) throw new Error('Bitte in einem interaktiven Terminal ausführen.');
      const muted = new Writable({write(_chunk,_encoding,done){done();}});
      const terminal = createInterface({input:process.stdin, output:muted, terminal:true});
      try {
        process.stdout.write('Neues Passwort (mindestens 16 Zeichen): ');
        const password = await terminal.question('');
        process.stdout.write('\nPasswort wiederholen: ');
        const repeated = await terminal.question('');
        process.stdout.write('\n');
        if (password.length < 16 || password.length > 256 || password !== repeated) throw new Error('Passwortlänge oder Wiederholung stimmt nicht.');
        db.prepare('INSERT INTO owner VALUES (1,?)').run(await hashPassword(password));
        console.log('Besitzerkonto eingerichtet.');
      } finally { terminal.close(); }
      return;
    }
    if (command === 'migrate') return;
    if (command === 'backup' && destination) { await backup(db,destination); return; }
    if (command) throw new Error('Unbekannter Befehl.');
    const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000');
    const planner = process.env.PLANNER_URL ? new URL(process.env.PLANNER_URL) : null;
    if ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname))) || (planner && planner.protocol !== 'https:')) throw new Error('Ungültige URL-Konfiguration.');
    const app = await createApp(db,origin.origin,planner?.href ?? '',fileURLToPath(new URL('../web/',import.meta.url)));
    await app.listen({host:'127.0.0.1',port:Number(process.env.PORT ?? 3000)});
    console.log('AlltagsWeise läuft auf localhost.');
    await new Promise<void>(resolve => {
      process.once('SIGTERM',resolve);
      process.once('SIGINT',resolve);
    });
    await app.close();
  } finally { db.close(); }
}
main().catch(error => {console.error(error instanceof Error ? error.message : 'Start fehlgeschlagen.');process.exitCode=1;});
