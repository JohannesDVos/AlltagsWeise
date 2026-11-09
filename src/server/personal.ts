import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Routine, RoutineInput, TodoInput } from '../shared/personal.js';
import { berlinDay, nextDue, streaks, validDay } from './routine-calendar.js';

const title = {type:'string', minLength:1, maxLength:160};
const date = {type:'string', minLength:10, maxLength:10};
const schema = (properties:Record<string,unknown>) => ({
  body:{type:'object', additionalProperties:false, required:Object.keys(properties), properties},
});
const titleSchema = schema({title});
const todoSchema = schema({title, note:{type:'string', maxLength:2000}, dueOn:{anyOf:[date,{type:'null'}]}});
const statusSchema = schema({completed:{type:'boolean'}});
const routineSchema = schema({
  title, rhythm:{type:'string', enum:['daily','weekly','monthly']},
  day:{anyOf:[{type:'integer', minimum:1, maximum:31},{type:'null'}]},
});
const completionSchema = schema({completed:{type:'boolean'}, dueOn:date});

function missing(reply:FastifyReply) {
  return reply.code(404).send({message:'Eintrag nicht gefunden.'});
}
function saved(reply:FastifyReply, changes:number|bigint) {
  return changes ? reply.code(204).send() : missing(reply);
}
function invalid(reply:FastifyReply, message:string) {
  return reply.code(400).send({message});
}

interface WithId {id:string}
interface RoutineRow extends RoutineInput {
  id: string;
  createdOn: string;
  archivedOn: string | null;
}

export function registerPersonal(app:FastifyInstance, db:DatabaseSync, now:()=>number) {
  const todos = '/api/v1/todos';
  const routines = '/api/v1/routines';
  const today = () => berlinDay(now());
  app.get(todos, async () => ({
    today:today(),
    items:db.prepare('SELECT * FROM todos ORDER BY completed, dueOn IS NULL, dueOn, rowid DESC')
      .all().map(row=>({...row, completed:row.completed===1})),
  }));
  app.post<{Body:TodoInput}>(todos,{schema:todoSchema},async (request,reply)=>{
    const {title,note,dueOn}=request.body;
    if (!title.trim() || (dueOn!==null && !validDay(dueOn))) return invalid(reply,'Bitte prüfe Titel und Fälligkeit.');
    const id=randomUUID();
    db.prepare('INSERT INTO todos(id,title,note,dueOn) VALUES (?,?,?,?)').run(id,title.trim(),note.trim(),dueOn);
    return reply.code(201).send({id});
  });
  app.put<{Body:TodoInput;Params:WithId}>(todos+'/:id',{schema:todoSchema},async (request,reply)=>{
    const {title,note,dueOn}=request.body;
    if (!title.trim() || (dueOn!==null && !validDay(dueOn))) return invalid(reply,'Bitte prüfe Titel und Fälligkeit.');
    return saved(reply,db.prepare('UPDATE todos SET title=?,note=?,dueOn=? WHERE id=?')
      .run(title.trim(),note.trim(),dueOn,request.params.id).changes);
  });
  app.patch<{Body:{completed:boolean};Params:WithId}>(todos+'/:id',{schema:statusSchema},async (request,reply)=>
    saved(reply,db.prepare('UPDATE todos SET completed=? WHERE id=?').run(Number(request.body.completed),request.params.id).changes));
  app.delete<{Params:WithId}>(todos+'/:id',async (request,reply)=>
    saved(reply,db.prepare('DELETE FROM todos WHERE id=?').run(request.params.id).changes));

  const readRoutine=db.prepare('SELECT * FROM routines WHERE id=?');
  app.get(routines,async ()=>{
    const date=today();
    const history=new Map<string,string[]>();
    for(const row of db.prepare('SELECT routineId,dueOn FROM routine_completions ORDER BY routineId,dueOn').all()) {
      const id=String(row.routineId);
      const dates=history.get(id) ?? [];
      dates.push(String(row.dueOn));
      history.set(id,dates);
    }
    const rows=db.prepare('SELECT * FROM routines ORDER BY rowid').all() as unknown as RoutineRow[];
    const items:Routine[]=rows.map(row=>{
      const completions=history.get(row.id) ?? [];
      const nextDueOn=row.archivedOn ? null : nextDue(row,date<row.createdOn ? row.createdOn : date);
      const dueToday=nextDueOn===date;
      return {
        id:row.id, title:row.title, rhythm:row.rhythm, day:row.day, archivedOn:row.archivedOn,
        nextDueOn, dueToday, completedToday:dueToday && completions.includes(date),
        completions, ...streaks(row,row.archivedOn ?? date,completions),
      };
    });
    return {today:date,items};
  });
  app.post<{Body:RoutineInput}>(routines,{schema:routineSchema},async (request,reply)=>{
    const {title,rhythm,day}=request.body;
    if (!title.trim() || (rhythm==='daily' && day!==null) || (rhythm==='weekly' && (day===null || day>7))) {
      return invalid(reply,'Bitte prüfe Titel und Wiederholung.');
    }
    const id=randomUUID();
    db.prepare('INSERT INTO routines(id,title,rhythm,day,createdOn) VALUES (?,?,?,?,?)')
      .run(id,title.trim(),rhythm,day,today());
    return reply.code(201).send({id});
  });
  app.put<{Body:{title:string};Params:WithId}>(routines+'/:id',{schema:titleSchema},async (request,reply)=>{
    const name=request.body.title.trim();
    if (!name) return invalid(reply,'Bitte gib einen Titel ein.');
    return saved(reply,db.prepare('UPDATE routines SET title=? WHERE id=? AND archivedOn IS NULL')
      .run(name,request.params.id).changes);
  });
  app.post<{Params:WithId}>(routines+'/:id/archive',async (request,reply)=>
    saved(reply,db.prepare('UPDATE routines SET archivedOn=COALESCE(archivedOn,?) WHERE id=?')
      .run(today(),request.params.id).changes));
  app.delete<{Params:WithId}>(routines+'/:id',async (request,reply)=>{
    const {id}=request.params;
    const routine=readRoutine.get(id);
    if (!routine) return missing(reply);
    if (!routine.archivedOn) return reply.code(409).send({message:'Archiviere die Routine vor dem Löschen.'});

    db.exec('BEGIN IMMEDIATE');
    let changes:number|bigint;
    try {
      db.prepare('DELETE FROM routine_completions WHERE routineId=?').run(id);
      changes=db.prepare('DELETE FROM routines WHERE id=?').run(id).changes;
      db.exec('COMMIT');
    } catch(error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return saved(reply,changes);
  });
  app.put<{Body:{completed:boolean;dueOn:string};Params:WithId}>(routines+'/:id/completion',{schema:completionSchema},async (request,reply)=>{
    const row=readRoutine.get(request.params.id) as unknown as RoutineRow | undefined;
    if (!row) return missing(reply);
    const date=today();
    if (row.archivedOn || date<row.createdOn || request.body.dueOn!==date || nextDue(row,date)!==date) {
      return reply.code(409).send({message:'Diese Routine kann nur am aktuellen Fälligkeitstag abgehakt werden.'});
    }
    if(request.body.completed) {
      db.prepare('INSERT INTO routine_completions VALUES (?,?) ON CONFLICT DO NOTHING').run(row.id,date);
    } else {
      db.prepare('DELETE FROM routine_completions WHERE routineId=? AND dueOn=?').run(row.id,date);
    }
    return reply.code(204).send();
  });
}
