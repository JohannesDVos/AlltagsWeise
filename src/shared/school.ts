export const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
export type Day = typeof weekdays[number];
export const dayNames: Record<Day,string> = {
  Mon:'Montag', Tue:'Dienstag', Wed:'Mittwoch', Thu:'Donnerstag', Fri:'Freitag', Sat:'Samstag', Sun:'Sonntag'
};
export const priorities = ['Niedrig','Normal','Hoch','Sehr hoch'];
export const eventTypes = ['Klausur','Arbeit','Test','Sonstiges'];
export interface Subject {id:string; name:string; color:string}
export interface Period {slot:number; start:string; end:string}
export interface Lesson {day:Day; slot:number; subject_id:string; room:string}
export interface Timetable {weekdays:Day[]; periods:Period[]; lessons:Lesson[]}
export interface SchoolConfig {subjects:Subject[]; timetable:Timetable}
export interface TaskInput {title:string; subject:string; priority:number; created_on:string; due_on:string}
export interface Task extends TaskInput {id:number; completed:boolean}
export interface EventInput {title:string; subject:string; event_date:string; event_type:string; notes:string}
export interface SchoolEvent extends EventInput {id:number}
export interface SchoolData extends SchoolConfig {tasks:Task[]; events:SchoolEvent[]}

export function schoolToday() {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format();
}
export function addDays(day:string,offset:number) {
  const date = new Date(day+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
export function nextLesson(timetable:Timetable,subject:string,from:string) {
  const parsed = new Date(from+'T00:00:00Z');
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==from) return '';
  const days = new Set(timetable.lessons.filter(lesson=>lesson.subject_id===subject).map(lesson=>lesson.day));
  for(let offset=0;offset<7;offset++) {
    const date=addDays(from,offset);
    if (date.length!==10 || date.startsWith('+')) return '';
    const weekday=weekdays[(new Date(date+'T00:00:00Z').getUTCDay()+6)%7];
    if(days.has(weekday)) return date;
  }
  return '';
}
