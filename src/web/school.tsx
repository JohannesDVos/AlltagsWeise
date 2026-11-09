import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { addDays, dayNames, eventTypes, nextLesson, priorities, schoolToday } from '../shared/school.js';
import type { SchoolConfig, SchoolData, SchoolEvent, Subject, Task } from '../shared/school.js';
import { api, ApiError, messageFor } from './api.js';
import { SchoolCalendar, formatDay } from './school-calendar.js';
import { SchoolSettings } from './school-settings.js';

const path='/school';
const views=['Aufgaben','Termine','Kalender','Stundenplan','Einstellungen'] as const;
type View=typeof views[number];
type Entry=Task|SchoolEvent;
function subjectMark(subject?:Subject,fallback='') {
  return <span className="school-subject">
    {subject && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill={subject.color}/></svg>}
    {subject?.name ?? fallback}
  </span>;
}

function EntryForm({data,kind,entry,busy,onSave,onCancel}:{data:SchoolData;kind:'tasks'|'events';entry?:Entry;busy:boolean;onSave:(body:unknown)=>void;onCancel:()=>void}) {
  const task=entry && 'due_on' in entry ? entry : undefined;
  const appointment=entry && 'event_date' in entry ? entry : undefined;
  const [subject,setSubject]=useState(entry?.subject ?? '');
  const [created,setCreated]=useState(task?.created_on ?? schoolToday());
  const [due,setDue]=useState(task?.due_on ?? '');
  const [manual,setManual]=useState(Boolean(task));
  const suggested=created && subject ? nextLesson(data.timetable,subject,created) : '';
  const effectiveDue=manual ? due : suggested;
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const title=String(fields.get('title') ?? '').trim();
    if (kind==='tasks') onSave({title,subject,created_on:created,due_on:effectiveDue,priority:Number(fields.get('priority'))});
    else onSave({title,subject,event_date:fields.get('event_date'),event_type:fields.get('event_type'),notes:fields.get('notes')});
  }
  return <form className="panel stack" onSubmit={save}>
    <h2>{kind==='tasks'?(task?'Aufgabe bearbeiten':'Neue Aufgabe'):(appointment?'Termin bearbeiten':'Neuer Termin')}</h2>
    <fieldset className="stack school-entry-fields" disabled={busy}>
      <label>Titel<input name="title" required maxLength={300} defaultValue={entry?.title}/></label>
      <label>Fach<select required value={subject} onChange={event=>setSubject(event.target.value)}>
        <option value="" disabled>Fach wählen</option>{data.subjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {kind==='tasks' ? <>
        <label>Priorität<select name="priority" defaultValue={task?.priority ?? 2}>{priorities.map((label,i)=><option key={label} value={i+1}>{label}</option>)}</select></label>
        <label>Aufgegeben am<input type="date" min="1000-01-01" max="9999-12-31" required value={created} onChange={event=>setCreated(event.target.value)}/></label>
        <label>Fällig am<input type="date" min="1000-01-01" max="9999-12-31" required value={effectiveDue} onChange={event=>{setManual(true);setDue(event.target.value);}}/></label>
        {suggested && <p className="muted">Nächste Unterrichtsstunde: {formatDay(suggested)} {manual && <button type="button" onClick={()=>setManual(false)}>Datum übernehmen</button>}</p>}
      </> : <>
        <label>Terminart<select name="event_type" defaultValue={appointment?.event_type ?? eventTypes[0]}>{Array.from(new Set([...eventTypes,...(appointment?[appointment.event_type]:[])])).map(type=><option key={type}>{type}</option>)}</select></label>
        <label>Datum<input type="date" name="event_date" min="1000-01-01" max="9999-12-31" required defaultValue={appointment?.event_date ?? schoolToday()}/></label>
        <label>Notizen<textarea name="notes" maxLength={2000} defaultValue={appointment?.notes}/></label>
      </>}
    </fieldset>
    <div className="actions"><button className="primary" disabled={busy}>Speichern</button>{entry && <button type="button" disabled={busy} onClick={onCancel}>Abbrechen</button>}</div>
  </form>;
}

export function School({onExpired}:{onExpired:()=>void}) {
  const [data,setData]=useState<SchoolData>();
  const [view,setView]=useState<View>('Aufgaben');
  const [editing,setEditing]=useState<Entry>();
  const [deleting,setDeleting]=useState<number>();
  const [version,setVersion]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const fail=useCallback((reason:unknown)=>{
    if(reason instanceof ApiError && reason.status===401) onExpired();
    else setError(messageFor(reason));
  },[onExpired]);
  useEffect(()=>{
    let active=true;
    void api<SchoolData>(path).then(value=>{if(active)setData(value);}).catch(reason=>{if(active)fail(reason);});
    return ()=>{active=false;};
  },[fail]);
  async function change(endpoint:string,method:string,body:unknown,done:string) {
    setBusy(true);setError('');setStatus('');
    try {
      await api(endpoint,method,body);
      setEditing(undefined);setDeleting(undefined);
      setStatus(done);
      const refreshed=await api<SchoolData>(path);
      setData(refreshed);
      setVersion(n=>n+1);
    } catch(reason){fail(reason);}
    finally{setBusy(false);}
  }
  function select(next:View) {
    setView(next);setEditing(undefined);setDeleting(undefined);setError('');setStatus('');
  }
  const today=schoolToday();
  const kind=view==='Termine'?'events':'tasks';
  const list=path+'/'+kind;
  function entries(values:Entry[],empty:string) {
    if (!values.length) return <p className="muted">{empty}</p>;
    return <ul className="wish-list">{values.map(entry=>{
      const task='due_on' in entry ? entry : undefined;
      const appointment='event_date' in entry ? entry : undefined;
      return <li className="panel stack" key={entry.id}>
        <div className="wish-title"><h3>{entry.title}</h3><span className="count">{subjectMark(data?.subjects.find(s=>s.id===entry.subject),entry.subject)}</span></div>
        {task && <p><time dateTime={task.due_on}>{formatDay(task.due_on)}</time> · {priorities[task.priority-1]}{!task.completed && task.due_on<today && <strong className="school-overdue"> · Überfällig</strong>}</p>}
        {appointment && <p><time dateTime={appointment.event_date}>{formatDay(appointment.event_date)}</time> · {appointment.event_type}</p>}
        {appointment?.notes && <p className="note">{appointment.notes}</p>}
        <div className="actions">
          {task && <button disabled={busy} onClick={()=>void change(list+'/'+entry.id,'PATCH',{completed:!task.completed},'Aufgabenstatus geändert.')}>{task.completed?'Wieder öffnen':'Als erledigt markieren'}</button>}
          <button disabled={busy} onClick={()=>{setEditing(entry);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[name=title]')?.focus());}}>Bearbeiten</button>
          <button disabled={busy} onClick={()=>setDeleting(entry.id)}>Löschen</button>
        </div>
        {deleting===entry.id && <div className="confirm"><p>„{entry.title}“ endgültig löschen?</p><div className="actions">
          <button className="danger" disabled={busy} onClick={()=>void change(list+'/'+entry.id,'DELETE',undefined,'Eintrag gelöscht.')}>Endgültig löschen</button>
          <button disabled={busy} onClick={()=>setDeleting(undefined)}>Behalten</button>
        </div></div>}
      </li>;
    })}</ul>;
  }
  const open=data?.tasks.filter(task=>!task.completed) ?? [];
  return <div className="stack school">
    <header className="intro"><p className="eyebrow">Deine Werkzeuge</p><h1>Schulplaner</h1><p>Aufgaben, Termine und Stundenplan an einem Ort.</p></header>
    <nav className="school-nav" aria-label="Schulplaner-Bereiche">{views.map(next=><button key={next} disabled={busy} aria-pressed={next===view} onClick={()=>select(next)}>{next}</button>)}</nav>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="status" role="status">{status}</p>
    {!data && (error ? <button onClick={()=>location.reload()}>Erneut laden</button> : <p role="status">Schulplaner wird geladen.</p>)}
    {data && <>
      {(view==='Aufgaben' || view==='Termine') && <>
        {data.subjects.length ? <EntryForm key={kind+'-'+(editing?.id ?? 'new')+'-'+version} data={data} kind={kind} entry={editing} busy={busy} onCancel={()=>setEditing(undefined)}
          onSave={body=>void change(editing?list+'/'+editing.id:list,editing?'PUT':'POST',body,'Eintrag gespeichert.')}/>
          : <section className="panel stack"><h2>Lege dein erstes Fach an</h2><p>Aufgaben und Termine werden einem Fach zugeordnet.</p><div><button className="primary" onClick={()=>select('Einstellungen')}>Fächer einrichten</button></div></section>}
        {view==='Aufgaben' ? <>
          <h2>Offene Aufgaben <span className="count">{open.length}</span></h2>
          <p className="muted">{open.filter(task=>task.due_on<today).length} überfällig · {open.filter(task=>task.due_on>=today && task.due_on<=addDays(today,7)).length} in den nächsten sieben Tagen</p>
          {entries(open,'Keine offenen Aufgaben.')}
          <h2>Erledigte Aufgaben</h2>{entries(data.tasks.filter(task=>task.completed),'Noch keine erledigten Aufgaben.')}
        </> : <><h2>Alle Termine</h2>{entries(data.events,'Noch keine Termine.')}</>}
      </>}
      {view==='Kalender' && <SchoolCalendar data={data}/>}
      {view==='Stundenplan' && <section className="stack"><h2>Stundenplan</h2>
        {!data.timetable.lessons.length && <p className="muted">Du kannst Unterrichtsstunden in den Einstellungen eintragen.</p>}
        <div className="tiles">{data.timetable.weekdays.map(day=><article className="panel stack" key={day}><h3>{dayNames[day]}</h3>
          {data.timetable.periods.filter(period=>data.timetable.lessons.some(lesson=>lesson.day===day && lesson.slot===period.slot)).map(period=>{
            const lesson=data.timetable.lessons.find(item=>item.day===day && item.slot===period.slot);
            return lesson && <div key={period.slot}><strong>{subjectMark(data.subjects.find(s=>s.id===lesson.subject_id))}</strong><p className="muted">{period.slot}. Stunde · {period.start}–{period.end}{lesson.room && ' · Raum '+lesson.room}</p></div>;
          })}
          {!data.timetable.lessons.some(lesson=>lesson.day===day) && <p className="muted">Kein Unterricht eingetragen.</p>}
        </article>)}</div>
      </section>}
      {view==='Einstellungen' && <>
        <SchoolSettings key={version} config={{subjects:data.subjects,timetable:data.timetable}} busy={busy} onSave={(config:SchoolConfig)=>void change(path+'/settings','PUT',config,'Stundenplan und Fächer gespeichert.')}/>
        <a href={'/api/v1'+path+'/export'} download>Schulplaner-Daten als JSON exportieren</a>
      </>}
    </>}
  </div>;
}
