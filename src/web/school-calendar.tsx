import { useState } from 'react';
import { addDays, dayNames, schoolToday, weekdays } from '../shared/school.js';
import type { SchoolData } from '../shared/school.js';

const monthLabel=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'});
const dateLabel=new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeZone:'UTC'});
export const formatDay=(day:string)=>dateLabel.format(new Date(day+'T00:00:00Z'));
export function SchoolCalendar({data}:{data:SchoolData}) {
  const today=schoolToday();
  const [selected,setSelected]=useState(today);
  const [month,setMonth]=useState(today.slice(0,7)+'-01');
  const start=new Date(month+'T00:00:00Z');
  const pad=(start.getUTCDay()+6)%7;
  const count=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  const entries=[...data.tasks.filter(task=>!task.completed).map(task=>({key:'task'+task.id,date:task.due_on,title:task.title,type:'Aufgabe'})),
    ...data.events.map(event=>({key:'event'+event.id,date:event.event_date,title:event.title,type:event.event_type}))];
  const byDate=new Map<string,typeof entries>();
  for(const entry of entries) byDate.set(entry.date,[...(byDate.get(entry.date) ?? []),entry]);
  function shift(offset:number) {
    const date=new Date(month+'T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth()+offset);
    const next=date.toISOString().slice(0,10);
    setMonth(next);setSelected(next);
  }
  return <section className="panel stack">
    <div className="wish-title"><h2>{monthLabel.format(start)}</h2><div className="actions">
      <button aria-label="Vorheriger Monat" onClick={()=>shift(-1)}>‹</button>
      <button onClick={()=>{setMonth(today.slice(0,7)+'-01');setSelected(today);}}>Heute</button>
      <button aria-label="Nächster Monat" onClick={()=>shift(1)}>›</button>
    </div></div>
    <div className="school-calendar">
      {weekdays.map(day=><strong key={day} title={dayNames[day]}>{dayNames[day].slice(0,2)}</strong>)}
      {Array.from({length:pad},(_,i)=><span key={'blank'+i}/>)}
      {Array.from({length:count},(_,i)=>{
        const day=addDays(month,i), total=byDate.get(day)?.length ?? 0;
        return <button key={day} type="button" aria-pressed={day===selected} aria-current={day===today?'date':undefined} aria-label={formatDay(day)+', Einträge: '+total} onClick={()=>setSelected(day)}>{i+1}{total>0 && <small aria-hidden="true">•</small>}</button>;
      })}
    </div>
    <div className="stack"><h3>{formatDay(selected)}</h3>
      {byDate.get(selected)?.map(entry=><p key={entry.key}><strong>{entry.type}:</strong> {entry.title}</p>) ?? <p className="muted">Keine Einträge für diesen Tag.</p>}
    </div>
  </section>;
}
