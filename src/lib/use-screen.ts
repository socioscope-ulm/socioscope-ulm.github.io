'use client';
import {useEffect,useState} from 'react';
import {ScreenHistory} from './navigation';
let manager:ScreenHistory|undefined;
function history(){return manager??=new ScreenHistory(window);}
export function useScreen(key:string,fallback:string):[string,(value:string)=>void]{
  const [value,setValue]=useState(fallback);
  useEffect(()=>{
    const h=history();h.start();
    const update=()=>setValue(h.current.screens[key]??fallback);
    h.listeners.add(update);update();
    return()=>{h.listeners.delete(update);};
  },[key,fallback]);
  return [value,(next:string)=>history().go({[key]:next})];
}
export function navigate(changes:Record<string,string>){history().go(changes);}
export function back(){history().back();}
