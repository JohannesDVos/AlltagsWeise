import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../dist/server/db.js';
import { createApp } from '../dist/server/app.js';
import { tokenDigest } from '../dist/server/auth.js';
import { nextDue, streaks, berlinDay } from '../dist/server/routine-calendar.js';

test('migration from v2 preserves wishlist and school entries',()=>{
  const dir=mkdtempSync(join(tmpdir(),'alltagsweise-personal-'));
  const path=join(dir,'app.sqlite');
  try {
    const old=openDatabase(path);
    try {
      old.exec(`DROP TABLE routine_completions; DROP TABLE routines; DROP TABLE todos;
        INSERT INTO wishes VALUES ('w','Wunsch',NULL,NULL,NULL,0,'2026-11-09','2026-11-09');
        INSERT INTO school_tasks(title,subject,priority,created_on,due_on) VALUES ('Aufgabe','Fach',1,'2026-11-09','2026-11-10');
        PRAGMA user_version=2;`);
    } finally {old.close();}
    const upgraded=openDatabase(path);
    try {
      assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,3);
      assert.equal(upgraded.prepare('SELECT title FROM wishes').get().title,'Wunsch');
      assert.equal(upgraded.prepare('SELECT title FROM school_tasks').get().title,'Aufgabe');
      assert.deepEqual(upgraded.prepare('SELECT * FROM todos').all(),[]);
    } finally {upgraded.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('calendar handles Berlin midnight, weekly boundaries and short months',()=>{
  const monday={rhythm:'weekly',day:1};
  const monthEnd={rhythm:'monthly',day:null};
  const day31={rhythm:'monthly',day:31};
  assert.equal(berlinDay(Date.parse('2026-03-29T21:59:59Z')),'2026-03-29');
  assert.equal(berlinDay(Date.parse('2026-03-29T22:00:00Z')),'2026-03-30');
  assert.equal(nextDue(monday,'2026-12-29'),'2027-01-04');
  assert.equal(nextDue(day31,'2026-02-01'),'2026-02-28');
  assert.equal(nextDue(day31,'2028-02-01'),'2028-02-29');
  assert.equal(nextDue(monthEnd,'2026-02-01'),'2026-02-28');
  assert.equal(nextDue(monthEnd,'2026-12-31'),'2026-12-31');
  assert.equal(nextDue(monthEnd,'2027-01-01'),'2027-01-31');
  assert.deepEqual(streaks(monday,'2027-01-04',['2026-12-21','2026-12-28']),{currentStreak:2,bestStreak:2});
  assert.deepEqual(streaks(monday,'2027-01-05',['2026-12-21','2026-12-28']),{currentStreak:0,bestStreak:2});
  assert.deepEqual(streaks(day31,'2026-03-02',['2026-01-31','2026-02-28']),{currentStreak:2,bestStreak:2});
});

test('signed-in owner manages todos and can only complete the active routine date once',async t=>{
  const origin='https://example.test';
  let now=Date.parse('2026-11-09T22:59:00Z');
  const db=openDatabase(':memory:');
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(tokenDigest('personal-test'),now+60*86400000);
  const app=await createApp(db,origin,undefined,()=>now);
  t.after(async()=>{await app.close();db.close();});
  const headers={origin,cookie:'__Host-alltagsweise=personal-test'};
  const call=(method,path,payload)=>app.inject({method,url:'/api/v1'+path,headers,payload});
  assert.equal((await app.inject('/api/v1/todos')).statusCode,401);
  assert.equal((await app.inject('/api/v1/routines')).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/todos',headers:{cookie:headers.cookie},payload:{title:'X',note:'',dueOn:null}})).statusCode,403);

  const addTodo=await call('POST','/todos',{title:'Einmal',note:'',dueOn:null});
  assert.equal(addTodo.statusCode,201);
  const todo='/todos/'+addTodo.json().id;
  assert.equal((await call('POST','/todos',{title:'Ungültig',note:'',dueOn:'2026-02-30'})).statusCode,400);
  assert.equal((await call('POST','/todos',{title:'Früher',note:'',dueOn:'2026-11-08'})).statusCode,201);
  assert.equal((await call('PUT',todo,{title:'Geändert',note:'Text',dueOn:'2026-11-10'})).statusCode,204);
  assert.equal((await call('POST','/todos',{title:'Ohne Datum',note:'',dueOn:null})).statusCode,201);
  assert.deepEqual((await call('GET','/todos')).json().items.map(item=>item.title),['Früher','Geändert','Ohne Datum']);
  assert.equal((await call('PATCH',todo,{completed:true})).statusCode,204);
  assert.equal((await call('GET','/todos')).json().items.at(-1).completed,true);
  assert.equal((await call('PATCH',todo,{completed:false})).statusCode,204);
  assert.equal((await call('DELETE',todo)).statusCode,204);

  const added=await call('POST','/routines',{title:'Lesen',rhythm:'daily',day:null});
  assert.equal(added.statusCode,201);
  const routine='/routines/'+added.json().id;
  const complete=(dueOn,completed=true)=>call('PUT',routine+'/completion',{completed,dueOn});
  const read=async()=>(await call('GET','/routines')).json().items.find(item=>item.id===added.json().id);
  assert.equal((await complete('2026-11-08')).statusCode,409);
  assert.equal((await complete('2026-11-09')).statusCode,204);
  assert.equal((await complete('2026-11-09')).statusCode,204);
  assert.deepEqual((await read()).completions,['2026-11-09']);
  now+=60000;
  assert.equal((await read()).currentStreak,1);
  assert.equal((await complete('2026-11-09',false)).statusCode,409);
  assert.equal((await complete('2026-11-10')).statusCode,204);
  assert.equal((await read()).bestStreak,2);
  assert.equal((await complete('2026-11-10',false)).statusCode,204);
  assert.equal((await read()).currentStreak,1);
  assert.equal((await complete('2026-11-10')).statusCode,204);
  now+=2*86400000;
  assert.equal((await read()).currentStreak,0);
  assert.equal((await read()).bestStreak,2);
  assert.equal((await call('PUT',routine,{title:'Weiterlesen'})).statusCode,204);
  assert.equal((await call('POST',routine+'/archive')).statusCode,204);
  assert.equal((await complete('2026-11-12')).statusCode,409);
  const archived=await read();
  assert.equal(archived.title,'Weiterlesen');
  assert.equal(archived.nextDueOn,null);
  assert.deepEqual(archived.completions,['2026-11-09','2026-11-10']);

  const weekly=await call('POST','/routines',{title:'Montags',rhythm:'weekly',day:1});
  assert.equal(weekly.statusCode,201);
  assert.equal((await call('PUT','/routines/'+weekly.json().id+'/completion',{dueOn:'2026-11-12',completed:true})).statusCode,409);
});
