import { useState } from 'react';
import { dayNames, weekdays } from '../shared/school.js';
import type { Day, Lesson, SchoolConfig } from '../shared/school.js';

export function SchoolSettings({config,busy,onSave}:{config:SchoolConfig;busy:boolean;onSave:(config:SchoolConfig)=>void}) {
  const [draft,setDraft]=useState<SchoolConfig>(()=>structuredClone(config));
  const {subjects,timetable:{weekdays:selected,periods,lessons}}=draft;
  function changeSchedule(patch:Partial<SchoolConfig['timetable']>) {
    setDraft({...draft,timetable:{...draft.timetable,...patch}});
  }
  function changeLesson(index:number,patch:Partial<Lesson>) {
    changeSchedule({lessons:lessons.map((lesson,i)=>i===index ? {...lesson,...patch} : lesson)});
  }
  function toggleDay(day:Day) {
    changeSchedule({weekdays:selected.includes(day) ? selected.filter(d=>d!==day) : weekdays.filter(d=>d===day || selected.includes(d))});
  }
  function addPeriod() {
    const slot=Array.from({length:99},(_,i)=>i+1).find(i=>!periods.some(period=>period.slot===i));
    if(slot) changeSchedule({periods:[...periods,{slot,start:'08:00',end:'08:45'}]});
  }
  function addLesson() {
    for(const day of selected) for(const period of periods) {
      if (!lessons.some(lesson=>lesson.day===day && lesson.slot===period.slot)) {
        changeSchedule({lessons:[...lessons,{day,slot:period.slot,subject_id:subjects[0].id,room:''}]});
        return;
      }
    }
  }
  return <form className="panel stack school-settings" onSubmit={event=>{event.preventDefault();onSave(draft);}}>
    <h2>Planer einrichten</h2>
    <fieldset className="stack" disabled={busy}>
      <legend>Fächer</legend>
      {subjects.map((subject,i)=><div className="school-fields" key={subject.id}>
        <label>Fachname<input required maxLength={100} value={subject.name} onChange={e=>setDraft({...draft,subjects:subjects.map((s,index)=>index===i ? {...s,name:e.target.value} : s)})}/></label>
        <label>Fachfarbe<input type="color" value={subject.color} onChange={e=>setDraft({...draft,subjects:subjects.map((s,index)=>index===i ? {...s,color:e.target.value} : s)})}/></label>
        <button type="button" aria-label={'Fach entfernen: '+(subject.name || i+1)} onClick={()=>setDraft({...draft,subjects:subjects.filter(s=>s.id!==subject.id)})}>Entfernen</button>
      </div>)}
      <button type="button" disabled={subjects.length>=100} onClick={()=>setDraft({...draft,subjects:[...subjects,{id:crypto.randomUUID(),name:'',color:'#075953'}]})}>Fach hinzufügen</button>
    </fieldset>
    <fieldset className="stack" disabled={busy}>
      <legend>Unterrichtstage und Zeiten</legend>
      <div className="actions school-days">{weekdays.map(day=><label key={day}><input type="checkbox" checked={selected.includes(day)} onChange={()=>toggleDay(day)}/>{dayNames[day]}</label>)}</div>
      {periods.map(period=><div className="school-fields" key={period.slot}>
        <strong>Stunde {period.slot}</strong>
        {(['start','end'] as const).map(key=><label key={key}>{key==='start'?'Beginn':'Ende'}<input type="time" required value={period[key]} onChange={e=>changeSchedule({periods:periods.map(p=>p.slot===period.slot ? {...p,[key]:e.target.value} : p)})}/></label>)}
        <button type="button" aria-label={'Zeitraum entfernen: Stunde '+period.slot} onClick={()=>changeSchedule({periods:periods.filter(p=>p.slot!==period.slot)})}>Entfernen</button>
      </div>)}
      <button type="button" disabled={periods.length>=24} onClick={addPeriod}>Zeitraum hinzufügen</button>
    </fieldset>
    <fieldset className="stack" disabled={busy}>
      <legend>Unterrichtsstunden</legend>
      {lessons.map((lesson,i)=><div className="school-fields" key={i}>
        <label>Tag<select required value={selected.includes(lesson.day)?lesson.day:''} onChange={e=>changeLesson(i,{day:e.target.value as Day})}><option value="" disabled>Tag wählen</option>{selected.map(day=><option key={day} value={day}>{dayNames[day]}</option>)}</select></label>
        <label>Stunde<select required value={periods.some(p=>p.slot===lesson.slot)?lesson.slot:''} onChange={e=>changeLesson(i,{slot:Number(e.target.value)})}><option value="" disabled>Stunde wählen</option>{periods.map(p=><option key={p.slot}>{p.slot}</option>)}</select></label>
        <label>Fach<select required value={subjects.some(s=>s.id===lesson.subject_id)?lesson.subject_id:''} onChange={e=>changeLesson(i,{subject_id:e.target.value})}><option value="" disabled>Fach wählen</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name || 'Unbenannt'}</option>)}</select></label>
        <label>Raum<input maxLength={100} value={lesson.room} onChange={e=>changeLesson(i,{room:e.target.value})}/></label>
        <button type="button" aria-label={'Unterrichtsstunde entfernen: Zeile '+(i+1)} onClick={()=>changeSchedule({lessons:lessons.filter((_,index)=>index!==i)})}>Entfernen</button>
      </div>)}
      <button type="button" disabled={!subjects.length || !selected.length || !periods.length || lessons.length>=selected.length*periods.length} onClick={addLesson}>Unterrichtsstunde hinzufügen</button>
    </fieldset>
    <div className="actions"><button className="primary" disabled={busy}>Stundenplan und Fächer speichern</button></div>
  </form>;
}
