import { useEffect, useRef, useState } from 'react';
import type { DatedList } from '../shared/personal.js';
import { api, ApiError, messageFor } from './api.js';

export function usePersonalList<T>(path:string,onExpired:()=>void) {
  const [data,setData]=useState<DatedList<T>>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const mutation=useRef({version:0,pending:false});
  useEffect(()=>{
    let active=true;
    let loading=false;
    async function refresh(initial=false) {
      if(loading || mutation.current.pending) return;
      const version=mutation.current.version;
      loading=true;
      try {
        const value=await api<DatedList<T>>(path);
        if(active && version===mutation.current.version) setData(value);
      } catch(reason) {
        if(!active || version!==mutation.current.version) return;
        if(reason instanceof ApiError && reason.status===401) onExpired();
        else if(initial) setError(messageFor(reason));
      } finally {loading=false;}
    }
    function refreshVisible() {
      if(document.visibilityState==='visible') void refresh();
    }
    void refresh(true);
    const timer=window.setInterval(refreshVisible,60000);
    document.addEventListener('visibilitychange',refreshVisible);
    return ()=>{
      active=false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',refreshVisible);
    };
  },[path,onExpired]);

  async function change(url:string,method:string,body:unknown,message:string,after?:()=>void) {
    if(mutation.current.pending) return;
    mutation.current={version:mutation.current.version+1,pending:true};
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await api(url,method,body);
      after?.();
      setStatus(message);
      setData(await api<DatedList<T>>(path));
    } catch(reason) {
      if(reason instanceof ApiError && reason.status===401) onExpired();
      else setError(messageFor(reason));
      if(reason instanceof ApiError && reason.status===409) {
        try {setData(await api<DatedList<T>>(path));}
        catch(refreshError) {
          if(refreshError instanceof ApiError && refreshError.status===401) onExpired();
        }
      }
    } finally {
      mutation.current.pending=false;
      setBusy(false);
    }
  }
  return {data,busy,error,status,change};
}
