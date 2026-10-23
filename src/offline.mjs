// API compatibility for strict online edition: never persist downloaded resources.
import {ensureAccess,protectedFetch} from './online-access.mjs';
const BASE=new URL('../',import.meta.url);
let manifest;
const listeners=new Set();
let state={supported:true,initialized:false,busy:false,completed:0,total:0,bytes:0,totalBytes:0,current:'',message:'公开在线版：无需登录，学习记录仅保存在本机。',error:'',cancelled:false,updateAvailable:false,persisted:false,readyStations:[]};
export const status=()=>({...state,readyStations:[]});
export function subscribe(fn){listeners.add(fn);fn(status());return()=>listeners.delete(fn);}
function emit(patch){state={...state,...patch};for(const fn of listeners)fn(status());}
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateManifest(value,base=BASE){
  if(!value||typeof value.version!=='string'||!value.version||!Array.isArray(value.files)||!value.files.length)throw new Error('在线资源清单无效');
  const seen=new Set();for(const f of value.files){const u=new URL(f.url,base);if(typeof f.url!=='string'||!f.url||u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||u.search||u.hash||seen.has(u.href)||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!['shell','station','audio','art'].includes(f.group))throw new Error('在线资源清单校验失败');seen.add(u.href);}return value;
}
export async function init(){const r=await protectedFetch(new URL('assets-manifest.json',BASE));manifest=validateManifest(await r.json());emit({initialized:true,message:'在线资源清单已读取；课程联网加载，音频按需读取，不提供离线下载。'});return status();}
export async function readResource(url){
  await ensureAccess();const target=new URL(url,BASE),file=manifest?.files.find(f=>new URL(f.url,BASE).href===target.href);if(!file)throw new Error('资源不在已验证清单内');
  const r=await protectedFetch(target),data=await r.clone().arrayBuffer();if(data.byteLength!==file.bytes||await digest(data)!==file.sha256)throw new Error('资源校验失败，请刷新重试：'+file.url);return r;
}
export async function readJSON(url){return (await readResource(url)).json();}
export async function stationReady(id){await ensureAccess();if(!manifest)throw new Error('在线资源尚未准备好');return manifest.files.some(f=>(f.stationIDs||[]).some(s=>String(s)===String(id)));}
// Retained historical name; always performs an public network request.
export async function getCachedResource(url){return readResource(url);}
export async function downloadStation(id){return stationReady(id);}
export async function downloadAll(){return init();}
export function cancelDownload(){}
export async function requestPersistence(){await ensureAccess();const persisted=await navigator.storage?.persist?.()||false;emit({persisted});return persisted;}
export async function applyUpdate(){await ensureAccess();location.reload();return true;}
