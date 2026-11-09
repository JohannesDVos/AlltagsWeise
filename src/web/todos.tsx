import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Todo } from '../shared/personal.js';
import { formatDay } from './school-calendar.js';
import { usePersonalList } from './use-personal-list.js';

const path='/todos';
export function Todos({onExpired}:{onExpired:()=>void}) {
  const {data,busy,error,status,change}=usePersonalList<Todo>(path,onExpired);
  const [editing,setEditing]=useState<Todo>();
  const [deleting,setDeleting]=useState<string>();
  const [formKey,setFormKey]=useState(0);
  function reset() {setEditing(undefined);setFormKey(key=>key+1);}
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const body={title:String(fields.get('title')).trim(),note:String(fields.get('note') ?? ''),dueOn:fields.get('dueOn') || null};
    void change(editing ? path+'/'+editing.id : path,editing?'PUT':'POST',body,'To-do gespeichert.',reset);
  }

  return <div className="stack">
    <header className="intro"><p className="eyebrow">Deine Werkzeuge</p><h1>To-dos</h1><p>Einmalige Aufgaben festhalten und abhaken.</p></header>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="status" role="status">{status}</p>
    {!data ? (error ? <button onClick={()=>location.reload()}>Erneut laden</button> : <p role="status">To-dos werden geladen.</p>) : <>
      <form key={formKey} className="panel stack" onSubmit={save}>
        <h2>{editing?'To-do bearbeiten':'Neues To-do'}</h2>
        <label>Titel<input name="title" maxLength={160} defaultValue={editing?.title} required disabled={busy}/></label>
        <details open={editing ? true : undefined}>
          <summary>Notiz und Fälligkeit</summary>
          <div className="stack personal-details">
            <label>Notiz<textarea name="note" maxLength={2000} defaultValue={editing?.note} disabled={busy}/></label>
            <label>Fällig am<input type="date" name="dueOn" min="1000-01-01" max="9999-12-31" defaultValue={editing?.dueOn ?? ''} disabled={busy}/></label>
          </div>
        </details>
        <div className="actions"><button className="primary" disabled={busy}>Speichern</button>
          {editing && <button type="button" disabled={busy} onClick={reset}>Abbrechen</button>}</div>
      </form>
      {[false,true].map(completed=>{
        const items=data.items.filter(todo=>todo.completed===completed);
        return <section className="stack" key={String(completed)}>
          <h2>{completed?'Erledigt':'Offen'} <span className="count">{items.length}</span></h2>
          {items.length===0 ? <p className="muted">{completed?'Noch keine erledigten To-dos.':'Keine offenen To-dos.'}</p> :
            <ul className="wish-list">{items.map(todo=><li className="panel stack" key={todo.id}>
              <h3>{todo.title}</h3>
              {todo.note && <p className="note">{todo.note}</p>}
              {todo.dueOn && <p><time dateTime={todo.dueOn}>{formatDay(todo.dueOn)}</time>
                {!completed && todo.dueOn<data.today && <strong className="school-overdue"> · Überfällig</strong>}</p>}
              <div className="actions">
                <button disabled={busy} onClick={()=>void change(path+'/'+todo.id,'PATCH',{completed:!completed},completed?'To-do wieder geöffnet.':'To-do erledigt.')}>{completed?'Wieder öffnen':'Abhaken'}</button>
                <button disabled={busy} onClick={()=>{setEditing(todo);setFormKey(key=>key+1);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[name=title]')?.focus());}}>Bearbeiten</button>
                <button disabled={busy} onClick={()=>setDeleting(todo.id)}>Löschen</button>
              </div>
              {deleting===todo.id && <div className="confirm"><p>„{todo.title}“ endgültig löschen?</p><div className="actions">
                <button className="danger" disabled={busy} onClick={()=>void change(path+'/'+todo.id,'DELETE',undefined,'To-do gelöscht.',()=>{
                  setDeleting(undefined);
                  if(editing?.id===todo.id) reset();
                })}>Endgültig löschen</button>
                <button disabled={busy} onClick={()=>setDeleting(undefined)}>Behalten</button>
              </div></div>}
            </li>)}</ul>}
        </section>;
      })}
    </>}
  </div>;
}
