import {createContext, useCallback, useContext, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import type {Catalog, Library, User} from '../shared/types';
import {api, json} from './api';
const emptyLibrary: Library = {likedTrackIds:[],savedAlbumIds:[],followedArtistIds:[],playlists:[]};
interface AppState {
  catalog: Catalog|null; user: User|null; library: Library; loading: boolean; error: string; notice: string;
  authMode: 'login'|'signup'|'forgot'|null; setAuthMode: (mode:'login'|'signup'|'forgot'|null)=>void;
  refreshCatalog: ()=>Promise<void>; refreshLibrary: ()=>Promise<void>; setUser:(user:User|null)=>void;
  notify:(text:string)=>void; requireUser:()=>boolean; toggleSave:(kind:'tracks'|'albums'|'artists',id:string)=>Promise<void>;
}
const Context=createContext<AppState|null>(null);
export function AppProvider({children}:{children:ReactNode}) {
  const [catalog,setCatalog]=useState<Catalog|null>(null); const [user,setUser]=useState<User|null>(null);
  const [library,setLibrary]=useState<Library>(emptyLibrary); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [notice,setNotice]=useState(''); const [authMode,setAuthMode]=useState<AppState['authMode']>(null);
  const notify=useCallback((text:string)=>setNotice(text),[]);
  const refreshCatalog=useCallback(async()=>{try{
    const first=await api<Catalog>('/catalog?limit=100&offset=0');
    const tracks=[...first.tracks];
    while(tracks.length<first.total){
      const next=await api<Catalog>(`/catalog?limit=100&offset=${tracks.length}`);
      if(!next.tracks.length)throw new Error('O catálogo não pôde ser carregado por completo.');
      tracks.push(...next.tracks);
    }
    setCatalog({...first,tracks});setError('');
  }catch(e){setError((e as Error).message);}},[]);
  const refreshLibrary=useCallback(async()=>{try{setLibrary(await api<Library>('/library'));}catch(e){notify((e as Error).message);}},[notify]);
  useEffect(()=>{void Promise.all([refreshCatalog(),api<{user:User|null}>('/me').then(({user:u})=>setUser(u)).catch(()=>{})]).finally(()=>setLoading(false));},[refreshCatalog]);
  useEffect(()=>{window.dispatchEvent(new Event('spotfy:auth-changed'));if(user)void refreshLibrary();else setLibrary(emptyLibrary);},[user,refreshLibrary]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(id);},[notice]);
  const requireUser=()=>{if(user)return true;setAuthMode('login');return false;};
  const toggleSave=async(kind:'tracks'|'albums'|'artists',id:string)=>{if(!requireUser())return;const list=kind==='tracks'?library.likedTrackIds:kind==='albums'?library.savedAlbumIds:library.followedArtistIds;const saved=list.includes(id);try{await api(`/library/${kind}/${id}`,json(saved?'DELETE':'PUT'));await refreshLibrary();notify(saved?'Removido da sua biblioteca.':'Adicionado à sua biblioteca.');}catch(e){notify((e as Error).message);}};
  return <Context.Provider value={{catalog,user,library,loading,error,notice,authMode,setAuthMode,refreshCatalog,refreshLibrary,setUser,notify,requireUser,toggleSave}}>{children}</Context.Provider>;
}
export function useApp(){const state=useContext(Context);if(!state)throw Error('AppProvider ausente');return state;}
