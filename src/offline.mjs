// Verified public-resource cache, separate from all learning-record stores.
import {ensureAccess,protectedFetch,onRequestStatus,resourceURL} from './online-access.mjs?v=loadfix-20261024-1';
const BASE=new URL('../',import.meta.url);
const CACHE='chufaba-public-resources-v1',pending=new Map(),results=new Map();
let manifest,initializing;
const listeners=new Set();
let state={supported:true,initialized:false,busy:false,completed:0,total:0,bytes:0,totalBytes:0,current:'',message:'公开在线版：无需登录，学习记录仅保存在本机。',error:'',cancelled:false,updateAvailable:false,persisted:false,readyStations:[]};
export const status=()=>({...state,readyStations:[]});
export function subscribe(fn){listeners.add(fn);fn(status());return()=>listeners.delete(fn);}
function emit(patch){state={...state,...patch};for(const fn of listeners){try{fn(status());}catch{}}}
onRequestStatus(event=>emit({current:event.filename,message:event.message,error:event.phase==='error'?event.message:'',busy:event.phase==='loading'||event.phase==='retry'}));
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateManifest(value,base=BASE){
  if(!value||typeof value.version!=='string'||!value.version||!Array.isArray(value.files)||!value.files.length)throw new Error('在线资源清单无效');
  const seen=new Set();for(const f of value.files){if(!f||typeof f.url!=='string'||!f.url)throw new Error('在线资源清单校验失败');const u=new URL(f.url,base);if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||u.username||u.password||/%(?:2f|5c)/i.test(u.pathname)||u.search||u.hash||seen.has(u.href)||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!['shell','station','audio','art'].includes(f.group))throw new Error('在线资源清单校验失败：'+f.url);seen.add(u.href);}return value;
}
export async function init(){
  if(manifest)return status();
  if(!initializing)initializing=(async()=>{const r=await protectedFetch(new URL('runtime-manifest.json',BASE));manifest=validateManifest(await r.json());emit({initialized:true,busy:false,error:'',message:'课程联网加载；校验通过的资源可复用，音频按站按需读取，不保证整站离线可用。'});return status();})().finally(()=>{initializing=undefined;});
  return initializing;
}
// Accept entries only from the app's hash-verified station audio index.
export function registerResources(entries){
  if(!manifest)throw new Error('在线资源尚未准备好');
  if(Array.isArray(entries)&&entries.length===0)return;
  validateManifest({version:manifest.version,files:entries});
  const merged=new Map(manifest.files.map(f=>[new URL(f.url,BASE).href,f]));
  for(const file of entries){const key=new URL(file.url,BASE).href,old=merged.get(key);if(old&&(old.sha256!==file.sha256||old.bytes!==file.bytes))throw new Error('资源清单冲突：'+file.url);merged.set(key,{...file});}
  manifest={...manifest,files:[...merged.values()]};
}
async function valid(response,file){const bytes=await response.clone().arrayBuffer();return bytes.byteLength===file.bytes&&await digest(bytes)===file.sha256;}
async function load(target,file,key){
  let cache;
  try{cache=await globalThis.caches?.open(CACHE);const cached=await cache?.match(key);if(cached&&await valid(cached,file))return cached;}catch{}
  for(let check=1;check<=2;check++){
    const response=await protectedFetch(target);
    if(await valid(response,file)){try{await cache?.put(key,response.clone());}catch{}return response;}
    const message=`${file.url}：SHA-256/字节数校验失败；第 ${check}/2 次校验`;
    emit({message:message+(check===1?'，重新联网读取一次':''),error:check===2?message:''});
    if(check===2)throw new Error(message);
  }
}
export async function readResource(url){
  await ensureAccess();const target=resourceURL(url),file=manifest?.files.find(f=>new URL(f.url,BASE).href===target.href);if(!file)throw new Error('资源不在已验证清单内：'+target.pathname.slice(BASE.pathname.length));
  const cacheURL=new URL(target);cacheURL.searchParams.set('__sha256',file.sha256);const key=cacheURL.href;
  if(results.has(key))return results.get(key).clone();
  if(!pending.has(key))pending.set(key,load(target,file,key).then(response=>{results.set(key,response);return response;}).finally(()=>pending.delete(key)));
  return (await pending.get(key)).clone();
}
export async function readJSON(url){return (await readResource(url)).json();}
export async function stationReady(id){await ensureAccess();if(!manifest)throw new Error('在线资源尚未准备好');return manifest.files.some(f=>(f.stationIDs||[]).some(s=>String(s)===String(id)));}
// Retained historical name; only hash-verified cache hits are reused.
export async function getCachedResource(url){return readResource(url);}
export async function downloadStation(id){return stationReady(id);}
export async function downloadAll(){return init();}
export function cancelDownload(){}
export async function requestPersistence(){await ensureAccess();const persisted=await navigator.storage?.persist?.()||false;emit({persisted});return persisted;}
export async function applyUpdate(){await ensureAccess();location.reload();return true;}
