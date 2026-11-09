import { weekdays } from '../shared/school.js';
import type { Day, EventInput, SchoolConfig, TaskInput } from '../shared/school.js';

export class SchoolInputError extends Error {}
function invalid(message:string):never {throw new SchoolInputError(message);}
export function record(value:unknown):Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) invalid('Ungültige Planerdaten.');
  return value as Record<string,unknown>;
}
export function items(value:unknown,max:number):unknown[] {
  if (!Array.isArray(value) || value.length>max) invalid('Ungültige oder zu lange Liste.');
  return value;
}
function text(value:unknown,max:number,min=1):string {
  if (typeof value!=='string' || value.trim().length<min || value.trim().length>max) invalid('Bitte prüfe die Textfelder.');
  return value.trim();
}
export function integer(value:unknown,min:number,max:number):number {
  if (typeof value!=='number' || !Number.isSafeInteger(value) || value<min || value>max) invalid('Ungültige Zahl.');
  return value;
}
function date(value:unknown) {
  const day=text(value,10);
  const parsed=new Date(day+'T00:00:00Z');
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==day) invalid('Bitte gib ein gültiges Datum ein.');
  return day;
}
function day(value:unknown):Day {
  if (!weekdays.includes(value as Day)) invalid('Ungültiger Wochentag.');
  return value as Day;
}
function time(value:unknown) {
  const result=text(value,5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) invalid('Bitte prüfe die Unterrichtszeiten.');
  return result;
}
function unique(values:(string|number)[]) {return new Set(values).size===values.length;}

export function schoolConfig(value:unknown):SchoolConfig {
  const input=record(value);
  const subjects=items(input.subjects,100).map(item=>{
    const row=record(item);
    const id=text(row.id,100);
    const name=text(row.name,100);
    const color=text(row.color ?? '#64748b',7);
    if (!/^#[\da-f]{6}$/i.test(color)) invalid('Ungültige Fachfarbe.');
    return {id,name,color};
  });
  const timetable=record(input.timetable);
  const selected=items(timetable.weekdays,7).map(day);
  const periods=items(timetable.periods,24).map(item=>{
    const row=record(item);
    const slot=integer(row.slot,1,99);
    const start=time(row.start),end=time(row.end);
    if (start>=end) invalid('Unterrichtsende muss nach dem Beginn liegen.');
    return {slot,start,end};
  }).sort((a,b)=>a.slot-b.slot);
  if (!unique(subjects.map(s=>s.id)) || !unique(selected) || !unique(periods.map(p=>p.slot))) invalid('Fächer, Tage und Stunden müssen eindeutig sein.');
  const lessons=items(timetable.lessons,168).map(item=>{
    const row=record(item);
    const lesson={day:day(row.day),slot:integer(row.slot,1,99),subject_id:text(row.subject_id,100),room:text(row.room ?? '',100,0)};
    if (!selected.includes(lesson.day) || !periods.some(p=>p.slot===lesson.slot) || !subjects.some(s=>s.id===lesson.subject_id)) invalid('Für jede Unterrichtsstunde müssen Tag, Zeit und Fach vorhanden sein.');
    return lesson;
  });
  if (!unique(lessons.map(l=>l.day+':'+l.slot))) invalid('Ein Zeitraum darf pro Wochentag nur einmal belegt sein.');
  return {subjects,timetable:{weekdays:weekdays.filter(d=>selected.includes(d)),periods,lessons}};
}
export function findSubject(config:SchoolConfig,id:string) {
  return config.subjects.find(s=>s.id===id) ?? config.subjects.find(s=>s.name===id);
}

export function restoreLegacySubjects(config:SchoolConfig,entries:unknown[]) {
  for(const entry of entries) {
    const name=text(record(entry).subject,100);
    if (findSubject(config,name)) continue;
    if (config.subjects.length>=100) invalid('Der Import enthält zu viele Fächer.');
    config.subjects.push({id:name,name,color:'#64748b'});
  }
}

function subject(value:unknown,config:SchoolConfig) {
  const id=text(value,100);
  const match=findSubject(config,id);
  return match?.id ?? invalid('Bitte wähle ein vorhandenes Fach.');
}
export function taskInput(value:unknown,config:SchoolConfig):TaskInput {
  const row=record(value);
  return {title:text(row.title,300),subject:subject(row.subject,config),priority:integer(row.priority,1,4),created_on:date(row.created_on),due_on:date(row.due_on)};
}
export function eventInput(value:unknown,config:SchoolConfig):EventInput {
  const row=record(value);
  return {title:text(row.title,300),subject:subject(row.subject,config),event_date:date(row.event_date),event_type:text(row.event_type,80),notes:text(row.notes ?? '',2000,0)};
}
