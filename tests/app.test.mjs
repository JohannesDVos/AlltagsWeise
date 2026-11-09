import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import { createApp } from '../dist/server/app.js';
import { openDatabase } from '../dist/server/db.js';
import { hashPassword } from '../dist/server/auth.js';

test('private sessions, wishlist lifecycle and SQLite restore',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'alltagsweise-'));
  const path=join(dir,'app.sqlite');
  const db=openDatabase(path);
  const password='a long synthetic test password';
  db.prepare('INSERT INTO owner VALUES (1,?)').run(await hashPassword(password));
  let time=Date.now();
  const origin='https://example.test';
  const app=await createApp(db,origin,'https://planner.example.test',undefined,()=>time);
  t.after(async ()=>{
    await app.close();
    db.close();
    rmSync(dir,{recursive:true,force:true});
  });
  const login='/api/v1/login';
  const list='/api/v1/wishes';
  const headers={origin};
  assert.equal((await app.inject(list)).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:login,payload:{password}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:login,headers,payload:{password:'wrong'}})).statusCode,401);
  const signIn=()=>app.inject({method:'POST',url:login,headers,payload:{password}});
  const session=await signIn();
  assert.equal(session.statusCode,204);
  assert.match(session.headers['set-cookie'], /HttpOnly/);
  assert.match(session.headers['set-cookie'], /Secure/);
  headers.cookie=session.headers['set-cookie'].split(';')[0];
  const send=(method,url,payload)=>app.inject({method,url,headers,payload});
  assert.equal((await send('GET','/api/v1/session')).headers['cache-control'],'no-store');
  assert.equal((await send('POST',list,{title:'   '})).statusCode,400);
  assert.equal((await send('POST',list,{title:'Invalid',link:'javascript:alert(1)'})).statusCode,400);
  const created=await send('POST',list,{title:'A book'});
  assert.equal(created.statusCode,201);
  const id=created.json().id;
  assert.equal((await send('PUT',list+'/'+id,{title:'New book',priceCents:1234,link:'https://example.test/book',note:'Paperback'})).statusCode,204);
  assert.equal((await send('PATCH',list+'/'+id,{fulfilled:true})).statusCode,204);
  const response=await send('GET',list);
  assert.equal(response.json()[0].fulfilled,true);
  assert.equal(response.json()[0].priceCents,1234);
  const snapshot=join(dir,'snapshot.sqlite');
  await backup(db,snapshot);
  const restored=openDatabase(snapshot);
  try {assert.equal(restored.prepare('SELECT title FROM wishes').get().title,'New book');}
  finally {restored.close();}
  assert.equal((await send('DELETE',list+'/'+id)).statusCode,204);
  assert.deepEqual((await send('GET',list)).json(),[]);
  assert.equal((await send('POST','/api/v1/logout')).statusCode,204);
  assert.equal((await send('GET',list)).statusCode,401);
  const renewed=await signIn();
  headers.cookie=renewed.headers['set-cookie'].split(';')[0];
  time+=31*86400000;
  assert.equal((await send('GET',list)).statusCode,401);
});

