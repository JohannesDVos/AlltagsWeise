import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Wish, WishInput } from '../shared/wish.js';
import { api, ApiError, messageFor } from './api.js';

const money = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const pathFor = (wish:Wish) => '/wishes/'+encodeURIComponent(wish.id);

export function Wishlist({onExpired}:{onExpired:()=>void}) {
  const [wishes,setWishes] = useState<Wish[]>();
  const [editing,setEditing] = useState<Wish>();
  const [confirm,setConfirm] = useState<Wish>();
  const [details,setDetails] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [formKey,setFormKey] = useState(0);
  function fail(reason:unknown) {
    if (reason instanceof ApiError && reason.status===401) onExpired();
    else setError(messageFor(reason));
  }
  useEffect(() => {
    let active = true;
    void api<Wish[]>('/wishes').then(data => {if(active) setWishes(data);}).catch(reason => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status===401) onExpired();
      else setError(messageFor(reason));
    });
    return () => {active=false;};
  },[onExpired]);

  async function change(action:()=>Promise<void>,success:string) {
    setBusy(true);setError('');setNotice('');
    try {await action();setNotice(success);} catch(reason) {fail(reason);}
    finally {setBusy(false);}
  }
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const price = String(data.get('price') ?? '').trim();
    if (price && !/^\d{1,7}([,.]\d{1,2})?$/.test(price)) {setError('Gib einen Preis mit höchstens zwei Nachkommastellen ein.');return;}
    const [euros,cents=''] = price.replace(',','.').split('.');
    const body:WishInput = {
      title:String(data.get('title')).trim(),link:String(data.get('link') ?? '').trim() || null,
      priceCents:price ? Number(euros)*100+Number(cents.padEnd(2,'0')) : null,
      note:String(data.get('note') ?? '').trim() || null
    };
    void change(async () => {
      if (editing) {
        await api(pathFor(editing),'PUT',body);
        setWishes(current => current?.map(w => w.id===editing.id ? {...w,...body} : w));
      } else {
        const wish = await api<Wish>('/wishes','POST',body);
        setWishes(current => [wish,...(current ?? [])]);
      }
      setEditing(undefined);setDetails(false);setFormKey(key=>key+1);
    },editing ? 'Änderungen gespeichert.' : 'Wunsch gespeichert.');
  }

  return <>
    <header className="intro"><p className="eyebrow">Deine Werkzeuge</p><h1>Wunschliste</h1><p>Was möchtest du dir irgendwann gönnen?</p></header>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="status" role="status">{notice}</p>
    <form key={formKey} className="panel stack" onSubmit={save}>
      <h2>{editing ? 'Wunsch bearbeiten' : 'Neuer Wunsch'}</h2>
      <label>Was wünschst du dir?<input name="title" required maxLength={160} defaultValue={editing?.title} placeholder="Zum Beispiel: Leselampe" /></label>
      {(details || editing) && <div className="stack">
        <label>Link<input name="link" type="url" maxLength={2048} defaultValue={editing?.link ?? ''}/></label>
        <label>Preis in Euro<input name="price" inputMode="decimal" maxLength={10} defaultValue={editing?.priceCents == null ? '' : (editing.priceCents/100).toFixed(2).replace('.',',')}/></label>
        <label>Notiz<textarea name="note" maxLength={2000} defaultValue={editing?.note ?? ''}/></label>
      </div>}
      <div className="actions">
        <button className="primary" disabled={busy || !wishes}>Speichern</button>
        {!editing && <button type="button" aria-expanded={details} onClick={()=>setDetails(!details)}>{details ? 'Details ausblenden' : 'Details hinzufügen'}</button>}
        {editing && <button type="button" disabled={busy} onClick={()=>{setEditing(undefined);setFormKey(key=>key+1);}}>Abbrechen</button>}
      </div>
    </form>
    {!wishes && (error ? <button onClick={()=>location.reload()}>Erneut laden</button> : <p role="status">Wünsche werden geladen.</p>)}
    {wishes && [false,true].map(fulfilled => {
      const items=wishes.filter(w=>w.fulfilled===fulfilled);
      return <section className="wish-section" key={String(fulfilled)}>
        <h2>{fulfilled ? 'Erfüllt' : 'Offen'} <span className="count">{items.length}</span></h2>
        {!items.length ? <p className="muted">{fulfilled ? 'Hier erscheinen erfüllte Wünsche.' : 'Deine offenen Wünsche erscheinen hier.'}</p> :
          <ul className="wish-list">{items.map(wish=><li className="panel stack" key={wish.id}>
            <div className="wish-title"><h3>{wish.title}</h3>{wish.priceCents!==null && <strong>{money.format(wish.priceCents/100)}</strong>}</div>
            {wish.note && <p className="note">{wish.note}</p>}
            {wish.link && <a href={wish.link} target="_blank" rel="noreferrer">Link öffnen ↗</a>}
            <div className="actions">
              <button disabled={busy} onClick={()=>void change(async ()=>{
                await api(pathFor(wish),'PATCH',{fulfilled:!wish.fulfilled});
                setWishes(current=>current?.map(w=>w.id===wish.id ? {...w,fulfilled:!w.fulfilled} : w));
              },wish.fulfilled ? 'Wunsch wieder geöffnet.' : 'Wunsch erfüllt.')}>{wish.fulfilled ? 'Wieder öffnen' : 'Als erfüllt markieren'}</button>
              <button disabled={busy} onClick={()=>{setEditing(wish);setFormKey(key=>key+1);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[name=title]')?.focus());}}>Bearbeiten</button>
              <button disabled={busy} onClick={()=>setConfirm(wish)}>Löschen</button>
            </div>
            {confirm?.id===wish.id && <div className="confirm"><p>„{wish.title}“ endgültig löschen?</p><div className="actions">
              <button className="danger" disabled={busy} onClick={()=>void change(async ()=>{
                await api(pathFor(wish),'DELETE');
                setWishes(current=>current?.filter(w=>w.id!==wish.id));setConfirm(undefined);
                if(editing?.id===wish.id){setEditing(undefined);setFormKey(key=>key+1);}
              },'Wunsch gelöscht.')}>Endgültig löschen</button>
              <button disabled={busy} onClick={()=>setConfirm(undefined)}>Behalten</button>
            </div></div>}
          </li>)}</ul>}
      </section>;
    })}
  </>;
}
