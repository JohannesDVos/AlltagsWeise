import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Rhythm, Routine } from '../shared/personal.js';
import { rhythmNames, weekdayNames } from '../shared/personal.js';
import { formatDay } from './school-calendar.js';
import { usePersonalList } from './use-personal-list.js';

const path='/routines';
function scheduleText(routine:Routine) {
  if(routine.rhythm==='weekly') return 'Wöchentlich · '+weekdayNames[(routine.day ?? 1)-1];
  if(routine.rhythm==='monthly') return 'Monatlich · '+(routine.day ? routine.day+'. Tag' : 'letzter Tag');
  return 'Täglich';
}

export function Routines({onExpired}:{onExpired:()=>void}) {
  const {data,busy,error,status,change}=usePersonalList<Routine>(path,onExpired);
  const [rhythm,setRhythm]=useState<Rhythm>('daily');
  const [editing,setEditing]=useState<Routine>();
  const [archiving,setArchiving]=useState<string>();
  const [formKey,setFormKey]=useState(0);
  function reset() {setEditing(undefined);setRhythm('daily');setFormKey(key=>key+1);}
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const title=String(fields.get('title')).trim();
    const day=fields.get('day');
    const body=editing ? {title} : {title,rhythm,day:day ? Number(day) : null};
    void change(editing ? path+'/'+editing.id : path,editing?'PUT':'POST',body,'Routine gespeichert.',reset);
  }
  function card(routine:Routine) {
    const url=path+'/'+routine.id;
    return <li key={routine.id} className="panel stack">
      <div className="wish-title"><h3>{routine.title}</h3>{routine.completedToday && <span className="count">Heute erledigt</span>}</div>
      <p className="muted">{scheduleText(routine)}{routine.nextDueOn && !routine.dueToday && <> · Nächster Termin <time dateTime={routine.nextDueOn}>{formatDay(routine.nextDueOn)}</time></>}</p>
      <p className="routine-streak"><span>Aktuelle Serie <strong>{routine.currentStreak}</strong></span><span>Beste Serie <strong>{routine.bestStreak}</strong></span></p>
      {!routine.archivedOn && <div className="actions">
        {routine.dueToday && <button className={routine.completedToday ? undefined : 'primary'} disabled={busy} onClick={()=>void change(url+'/completion','PUT',{completed:!routine.completedToday,dueOn:routine.nextDueOn},routine.completedToday?'Abhaken rückgängig gemacht.':'Routine abgehakt.')}>{routine.completedToday?'Rückgängig':'Abhaken'}</button>}
        <button disabled={busy} onClick={()=>{setEditing(routine);setFormKey(key=>key+1);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[name=title]')?.focus());}}>Titel bearbeiten</button>
        <button disabled={busy} onClick={()=>setArchiving(routine.id)}>Archivieren</button>
      </div>}
      {archiving===routine.id && <div className="confirm"><p>„{routine.title}“ archivieren? Die bisherige Serie bleibt im Archiv sichtbar.</p><div className="actions">
        <button disabled={busy} onClick={()=>void change(url+'/archive','POST',undefined,'Routine archiviert.',()=>{
          setArchiving(undefined);
          if(editing?.id===routine.id) reset();
        })}>Archivierung bestätigen</button>
        <button disabled={busy} onClick={()=>setArchiving(undefined)}>Abbrechen</button>
      </div></div>}
      {routine.completions.length>0 && <details><summary>Erledigte Termine ({routine.completions.length})</summary>
        <ul>{routine.completions.slice().reverse().map(date=><li key={date}><time dateTime={date}>{formatDay(date)}</time></li>)}</ul>
      </details>}
    </li>;
  }

  const current=data?.items.filter(item=>!item.archivedOn) ?? [];
  const due=current.filter(item=>item.dueToday);
  const upcoming=current.filter(item=>!item.dueToday).sort((a,b)=>(a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
  const archive=data?.items.filter(item=>item.archivedOn) ?? [];
  return <div className="stack">
    <header className="intro"><p className="eyebrow">Deine Werkzeuge</p><h1>Routinen</h1><p>Wiederkehrende Aufgaben und deine Serien im Blick.</p></header>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="status" role="status">{status}</p>
    {!data ? (error ? <button onClick={()=>location.reload()}>Erneut laden</button> : <p role="status">Routinen werden geladen.</p>) : <>
      <form key={formKey} className="panel stack school" onSubmit={save}>
        <h2>{editing?'Titel bearbeiten':'Neue Routine'}</h2>
        <label>Titel<input name="title" maxLength={160} defaultValue={editing?.title} required disabled={busy}/></label>
        {!editing && <>
          <label>Wiederholung<select value={rhythm} onChange={event=>setRhythm(event.target.value as Rhythm)} disabled={busy}>
            {Object.entries(rhythmNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          {rhythm==='weekly' && <label>Wochentag<select name="day" disabled={busy}>
            {weekdayNames.map((day,i)=><option key={day} value={i+1}>{day}</option>)}
          </select></label>}
          {rhythm==='monthly' && <label>Monatstag<select name="day" disabled={busy}>
            <option value="">Letzter Tag im Monat</option>{Array.from({length:31},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}
          </select></label>}
        </>}
        <div className="actions"><button className="primary" disabled={busy}>Speichern</button>
          {editing && <button type="button" disabled={busy} onClick={reset}>Abbrechen</button>}</div>
      </form>
      <section className="stack"><h2>Heute fällig <span className="count">{due.length}</span></h2>
        {due.length ? <ul className="wish-list">{due.map(card)}</ul> : <p className="muted">Heute ist keine Routine fällig.</p>}
      </section>
      <section className="stack"><h2>Nächste Termine</h2>
        {upcoming.length ? <ul className="wish-list">{upcoming.map(card)}</ul> : <p className="muted">Keine weiteren Routinen geplant.</p>}
      </section>
      {archive.length>0 && <section className="stack"><h2>Archiv</h2><ul className="wish-list">{archive.map(card)}</ul></section>}
    </>}
  </div>;
}
