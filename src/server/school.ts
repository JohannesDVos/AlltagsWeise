import type { FastifyInstance, FastifyReply } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { SchoolConfig, SchoolData, SchoolEvent, Task } from '../shared/school.js';
import { eventInput, integer, items, record, restoreLegacySubjects, schoolConfig, SchoolInputError, taskInput } from './school-validation.js';

const base='/api/v1/school';
const empty:SchoolConfig={subjects:[],timetable:{weekdays:['Mon','Tue','Wed','Thu','Fri'],periods:[],lessons:[]}};
function readConfig(db:DatabaseSync):SchoolConfig {
  const row=db.prepare('SELECT payload FROM school_config WHERE id=1').get();
  return row ? JSON.parse(String(row.payload)) as SchoolConfig : empty;
}
function writeConfig(db:DatabaseSync,config:SchoolConfig) {
  db.prepare('INSERT INTO school_config VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(config));
}
function snapshot(db:DatabaseSync):SchoolData {
  const tasks=db.prepare('SELECT * FROM school_tasks ORDER BY completed, priority DESC, due_on, id DESC').all();
  const events=db.prepare('SELECT * FROM school_events ORDER BY event_date, id DESC').all();
  return {...readConfig(db),tasks:tasks.map(row=>({...row,completed:row.completed===1})) as unknown as Task[],events:events as unknown as SchoolEvent[]};
}
export function importSchool(db:DatabaseSync,value:unknown) {
  const input=record(value);
  const config=schoolConfig(input);
  const legacyTasks=items(input.tasks,50000);
  const legacyEvents=items(input.events,50000);
  restoreLegacySubjects(config,[...legacyTasks,...legacyEvents]);
  const tasks=legacyTasks.map(item=>{
    const row=record(item);
    const done=row.completed===true || row.completed===false ? Number(row.completed) : integer(row.completed,0,1);
    return {id:integer(row.id,1,Number.MAX_SAFE_INTEGER),done,...taskInput(row,config)};
  });
  const events=legacyEvents.map(item=>({id:integer(record(item).id,1,Number.MAX_SAFE_INTEGER),...eventInput(item,config)}));
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT 1 FROM school_config UNION ALL SELECT 1 FROM school_tasks UNION ALL SELECT 1 FROM school_events LIMIT 1').get()) {
      throw new SchoolInputError('Der Import ist nur in einen leeren Schulplaner möglich.');
    }
    writeConfig(db,config);
    const addTask=db.prepare('INSERT INTO school_tasks(id,title,subject,priority,created_on,due_on,completed) VALUES (?,?,?,?,?,?,?)');
    const addEvent=db.prepare('INSERT INTO school_events(id,title,subject,event_date,event_type,notes) VALUES (?,?,?,?,?,?)');
    for(const t of tasks) addTask.run(t.id,t.title,t.subject,t.priority,t.created_on,t.due_on,t.done);
    for(const e of events) addEvent.run(e.id,e.title,e.subject,e.event_date,e.event_type,e.notes);
    db.exec('COMMIT');
    return {tasks:tasks.length,events:events.length};
  } catch(error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function checked(reply:FastifyReply,action:()=>unknown) {
  try {return action();}
  catch(error) {
    if (error instanceof SchoolInputError) return reply.code(400).send({message:error.message});
    throw error;
  }
}
function result(reply:FastifyReply,changes:number|bigint) {
  return changes ? reply.code(204).send() : reply.code(404).send({message:'Eintrag nicht gefunden.'});
}
export function registerSchool(app:FastifyInstance,db:DatabaseSync) {
  app.get(base,async ()=>snapshot(db));
  app.get(base+'/export',async (_,reply)=>reply.header('Content-Disposition','attachment; filename="schulplaner.json"').send(snapshot(db)));
  app.put(base+'/settings',{bodyLimit:262144},async (request,reply)=>checked(reply,()=>{
    const config=schoolConfig(request.body);
    const used=db.prepare('SELECT subject FROM school_tasks UNION SELECT subject FROM school_events').all();
    if (used.some(row=>!config.subjects.some(s=>s.id===row.subject))) throw new SchoolInputError('Dieses Fach wird noch in einer Aufgabe oder einem Termin verwendet.');
    writeConfig(db,config);
    return config;
  }));
  for(const kind of ['tasks','events'] as const) {
    const route=base+'/'+kind;
    const table=kind==='tasks'?'school_tasks':'school_events';
    function values(body:unknown) {
      const config=readConfig(db);
      if(kind==='tasks') {
        const t=taskInput(body,config);
        return [t.title,t.subject,t.priority,t.created_on,t.due_on];
      }
      const e=eventInput(body,config);
      return [e.title,e.subject,e.event_date,e.event_type,e.notes];
    }
    const columns=kind==='tasks'?['title','subject','priority','created_on','due_on']:['title','subject','event_date','event_type','notes'];
    const insert=db.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES (?,?,?,?,?)');
    const update=db.prepare('UPDATE '+table+' SET '+columns.map(c=>c+'=?').join(',')+' WHERE id=?');
    const remove=db.prepare('DELETE FROM '+table+' WHERE id=?');
    app.post(route,async (request,reply)=>checked(reply,()=>{
      const row=insert.run(...values(request.body));
      return reply.code(201).send({id:Number(row.lastInsertRowid)});
    }));
    app.put<{Params:{id:string}}>(route+'/:id',async (request,reply)=>checked(reply,()=>result(reply,update.run(...values(request.body),request.params.id).changes)));
    app.delete<{Params:{id:string}}>(route+'/:id',async (request,reply)=>result(reply,remove.run(request.params.id).changes));
  }
  app.patch<{Params:{id:string}}>(base+'/tasks/:id',async (request,reply)=>checked(reply,()=>{
    const {completed}=record(request.body);
    if (typeof completed!=='boolean') throw new SchoolInputError('Ungültiger Aufgabenstatus.');
    return result(reply,db.prepare('UPDATE school_tasks SET completed=? WHERE id=?').run(Number(completed),request.params.id).changes);
  }));
}
