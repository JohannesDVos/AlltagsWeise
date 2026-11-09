import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError, messageFor } from './api.js';
import { modules } from './modules.js';
import { Wishlist } from './wishlist.js';
import { School } from './school.js';
import './style.css';

type Session = {authenticated:boolean};
function App() {
  const [session,setSession] = useState<Session|null>();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const expired = useCallback(()=>{setSession(null);setError('Bitte melde dich erneut an.');},[]);
  useEffect(()=>{
    let active=true;
    void api<Session>('/session').then(data=>{if(active)setSession(data);}).catch(reason=>{
      if(!active)return;
      if(reason instanceof ApiError && reason.status===401)setSession(null);
      else setError(messageFor(reason));
    });
    return ()=>{active=false;};
  },[]);
  async function login(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    setBusy(true);setError('');
    try {await api('/login','POST',{password:data.get('password')});setSession(await api<Session>('/session'));}
    catch(reason){setError(messageFor(reason));}
    finally{setBusy(false);}
  }
  async function logout() {
    setBusy(true);setError('');
    try {await api('/logout','POST');setSession(null);}
    catch(reason){if(reason instanceof ApiError && reason.status===401)setSession(null);else setError(messageFor(reason));}
    finally{setBusy(false);}
  }
  const brand=<a className="brand" href="/"><img src="/icon.svg" alt="" width="40" height="40"/>AlltagsWeise</a>;
  if(!session) return <main className="gate" id="inhalt"><div className="panel stack">
    {brand}
    {session===null ? <form className="stack" onSubmit={login}>
      <h1>Anmelden</h1>
      <label>Passwort<input type="password" name="password" autoComplete="current-password" required maxLength={256}/></label>
      <button className="primary" disabled={busy}>{busy?'Anmeldung läuft':'Anmelden'}</button>
    </form> : error ? <button onClick={()=>location.reload()}>Erneut laden</button> : <p role="status">AlltagsWeise wird geladen.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div></main>;
  const tools=modules;
  const current=location.pathname;
  return <div className="layout">
    <a className="skip" href="#inhalt">Zum Inhalt</a>
    <aside>{brand}<nav aria-label="Werkzeuge">{tools.map(tool=><a key={tool.id} href={tool.href} aria-current={current===tool.href?'page':undefined}>
      <span aria-hidden="true">{tool.symbol}</span>{tool.name}
    </a>)}</nav><button disabled={busy} onClick={()=>void logout()}>Abmelden</button></aside>
    <main id="inhalt" tabIndex={-1}>
      {error && <p className="error" role="alert">{error}</p>}
      {current==='/wunschliste' ? <Wishlist onExpired={expired}/> : current==="/schulplaner" ? <School onExpired={expired}/> : <>
        <header className="intro"><p className="eyebrow">Dein Alltag, an einem Ort</p><h1>Übersicht</h1><p>Wähle ein Werkzeug und leg los.</p></header>
        <div className="tiles">{tools.filter(tool=>tool.id!=='home').map(tool=><a className="panel tile" key={tool.id} href={tool.href}>
          <span className="symbol" aria-hidden="true">{tool.symbol}</span><h2>{tool.name}</h2><p>{tool.description}</p>
        </a>)}</div>
      </>}
    </main>
  </div>;
}
const root=document.getElementById('root');
if(root) createRoot(root).render(<App/>);
