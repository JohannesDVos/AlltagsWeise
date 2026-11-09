import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../dist/server/db.js';
import { createApp } from '../dist/server/app.js';
import { tokenDigest } from '../dist/server/auth.js';
import { importSchool } from '../dist/server/school.js';
import { nextLesson } from '../dist/shared/school.js';

const school='/api/v1/school';
const origin='https://example.test';
const config={
  subjects:[{id:'math',name:'Mathematik',color:'#075953'}],
  timetable:{weekdays:['Mon'],periods:[{slot:1,start:'08:00',end:'08:45'}],
    lessons:[{day:'Mon',slot:1,subject_id:'math',room:'A1'}]}
};
const task={title:'Übung 4',subject:'math',priority:3,created_on:'2026-11-06',due_on:'2026-11-09'};
const appointment={title:'Klassenarbeit',subject:'math',event_date:'2026-11-09',event_type:'Arbeit',notes:'Lineal mitbringen'};

test('migrates existing wishes and imports legacy records transactionally',()=>{
  const dir=mkdtempSync(join(tmpdir(),'alltagsweise-school-'));
  const file=join(dir,'old.sqlite');
  try {
    const legacy=new DatabaseSync(file);
    try {
      legacy.exec("CREATE TABLE wishes(id TEXT PRIMARY KEY,title TEXT); INSERT INTO wishes VALUES('w','Ein Wunsch'); PRAGMA user_version=1");
    } finally {legacy.close();}
    const db=openDatabase(file);
    try {
      const legacyTask={id:5,...task,subject:'Mathematik',completed:1};
      assert.throws(()=>importSchool(db,{...config,tasks:[legacyTask,legacyTask],events:[]}));
      assert.equal(db.prepare('SELECT count(*) AS total FROM school_config').get().total,0);
      assert.deepEqual(importSchool(db,{...config,tasks:[legacyTask],events:[{id:8,...appointment,subject:'Altes Fach'}]}),{tasks:1,events:1});
      assert.throws(()=>importSchool(db,{...config,tasks:[],events:[]}),/leeren Schulplaner/);
    } finally {db.close();}
    const reopened=openDatabase(file);
    try {
      assert.equal(reopened.prepare('SELECT title FROM wishes').get().title,'Ein Wunsch');
      const imported=reopened.prepare('SELECT subject,completed FROM school_tasks WHERE id=5').get();
      assert.equal(imported.subject,'math');
      assert.equal(imported.completed,1);
      const event=reopened.prepare('SELECT notes,subject FROM school_events WHERE id=8').get();
      assert.equal(event.notes,appointment.notes);
      assert.equal(event.subject,'Altes Fach');
      assert.match(reopened.prepare('SELECT payload FROM school_config').get().payload,/Altes Fach/);
    } finally {reopened.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('uses shared session and origin checks for school CRUD, settings and export',async t=>{
  const db=openDatabase(':memory:');
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(tokenDigest('test-session'),Date.now()+60000);
  const app=await createApp(db,origin);
  t.after(async()=>{await app.close();db.close();});
  const headers={origin,cookie:'__Host-alltagsweise=test-session'};
  const send=(method,url,payload)=>app.inject({method,url:school+url,headers,payload});
  assert.equal((await app.inject(school)).statusCode,401);
  assert.equal((await app.inject(school+'/export')).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:school+'/tasks',headers:{...headers,origin:'https://other.test'},payload:task})).statusCode,403);
  assert.equal((await send('PUT','/settings',config)).statusCode,200);
  assert.equal(nextLesson(config.timetable,'math',task.created_on),task.due_on);
  assert.equal(nextLesson(config.timetable,'math','10000-11-01'),'');
  assert.equal((await send('POST','/tasks',{...task,due_on:'2026-02-30'})).statusCode,400);
  assert.equal((await send('POST','/tasks',{...task,subject:'missing'})).statusCode,400);
  const created=await send('POST','/tasks',task);
  assert.equal(created.statusCode,201);
  const taskUrl='/tasks/'+created.json().id;
  assert.equal((await send('PUT',taskUrl,{...task,title:'Übung 5'})).statusCode,204);
  assert.equal((await send('PATCH',taskUrl,{completed:true})).statusCode,204);
  const event=await send('POST','/events',appointment);
  assert.equal(event.statusCode,201);
  const eventUrl='/events/'+event.json().id;
  assert.equal((await send('PUT',eventUrl,{...appointment,notes:'Taschenrechner mitbringen'})).statusCode,204);
  assert.equal((await send('PUT','/settings',{subjects:[],timetable:{...config.timetable,lessons:[]}})).statusCode,400);
  const exported=await send('GET','/export');
  assert.match(exported.headers['content-disposition'],/attachment/);
  assert.equal(exported.headers['cache-control'],'no-store');
  assert.equal(exported.json().tasks[0].completed,true);
  assert.equal(exported.json().tasks[0].title,'Übung 5');
  assert.equal(exported.json().events[0].notes,'Taschenrechner mitbringen');
  assert.equal((await send('DELETE',eventUrl)).statusCode,204);
  assert.equal((await send('DELETE',taskUrl)).statusCode,204);
  assert.equal((await send('DELETE',taskUrl)).statusCode,404);
});
