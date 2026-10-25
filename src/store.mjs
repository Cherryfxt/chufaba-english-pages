import {createState,validateState,snapshot,importLegacy36,reselectRoster} from './domain.mjs?v=legacy36-20261025';

export function canonicalJSON(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
}
export async function sha256(text){
  const bytes=typeof text==='string'?new TextEncoder().encode(text):text;
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function assert(condition,code){if(!condition)throw new Error(code);}
function exact(o,keys){assert(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===keys.sort().join('|'),'invalidBackup');}
export async function encodeBackup(state,revision,context){
  validateState(state,context);
  const payload={revision,state:structuredClone(state)};
  return JSON.stringify({kind:'chufaba-pwa-backup',version:1,payload,sha256:await sha256(canonicalJSON(payload))},null,2);
}
export async function decodeBackup(text,context){
  assert(typeof text==='string'&&text.length>0&&text.length<25*1024*1024,'invalidBackupSize');
  let envelope;try{envelope=JSON.parse(text);}catch{throw new Error('invalidBackupJSON');}
  exact(envelope,['kind','version','payload','sha256']);
  assert(envelope.kind==='chufaba-pwa-backup'&&envelope.version===1,'unsupportedArchive');
  exact(envelope.payload,['revision','state']);
  assert(Number.isSafeInteger(envelope.payload.revision)&&envelope.payload.revision>=0,'invalidBackupRevision');
  assert(typeof envelope.sha256==='string'&&/^[a-f0-9]{64}$/.test(envelope.sha256),'invalidBackupChecksum');
  assert(await sha256(canonicalJSON(envelope.payload))===envelope.sha256,'backupChecksumMismatch');
  validateState(envelope.payload.state,context);
  const s=snapshot(envelope.payload.state);
  return {state:structuredClone(envelope.payload.state),revision:envelope.payload.revision,digest:envelope.sha256,summary:{nickname:s.profile?.nickname??'未激活',completedStations:s.completedStationIDs.length,answered:envelope.payload.state.sessions.reduce((n,x)=>n+x.firstAnswers.length,0),points:s.points,miles:s.miles,pendingClaims:s.pendingHonors.length+s.pendingParts.length}};
}

/** One record is the sole authoritative state; a readwrite transaction enforces CAS across tabs. */
export class Store {
  constructor({catalog,stations,contentVersions,dbName='chufaba-pwa-v1',indexedDB=globalThis.indexedDB}){
    this.context={catalog,stations,contentVersions};this.dbName=dbName;this.indexedDB=indexedDB;
    this.revision=null;this.state=null;this.db=null;this.queue=Promise.resolve();this.previews=new WeakMap();
  }
  async open(){
    if(this.db)return this.db;
    assert(this.indexedDB,'storageUnavailable');
    this.db=await new Promise((resolve,reject)=>{
      const request=this.indexedDB.open(this.dbName,1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('state');};
      request.onerror=()=>reject(request.error||new Error('storageOpenFailed'));
      request.onblocked=()=>reject(new Error('storageUpgradeBlocked'));
      request.onsuccess=()=>resolve(request.result);
    });
    this.db.onversionchange=()=>{this.db.close();this.db=null;this.revision=null;};
    return this.db;
  }
  validateRecord(record){
    if(record===undefined)return {revision:0,state:createState()};
    exact(record,['revision','state']);assert(Number.isSafeInteger(record.revision)&&record.revision>0,'corruptLocalArchive');
    validateState(record.state,this.context);return record;
  }
  async load(){
    await this.queue.catch(()=>{});
    const raw=await this.readRaw();let record;
    try{record=this.validateRecord(raw);}catch(cause){const error=new Error('corruptLocalArchive',{cause});error.isLocalCorruption=true;throw error;}
    this.revision=record.revision;this.state=structuredClone(record.state);return structuredClone(this.state);
  }
  async readRaw(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get('main');let value;
      request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||new Error('storageReadFailed'));tx.onabort=()=>reject(tx.error||new Error('storageReadAborted'));
    });
  }
  enqueue(operation){const task=this.queue.then(operation);this.queue=task.catch(()=>{});return task;}
  async commit(change,expectedRevision,{allowProfileReplace=false,backupBefore=false}={}){
    const db=await this.open();
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),os=tx.objectStore('state'),request=os.get('main');let value,failure;
      request.onsuccess=()=>{
        try{
          const old=this.validateRecord(request.result);
          assert(old.revision===expectedRevision,'revisionConflict');
          const next=change(structuredClone(old.state));assert(!(next instanceof Promise),'asyncTransactionNotAllowed');
          validateState(next,this.context);
          if(!allowProfileReplace&&old.state.legacy36&&old.state.legacy36.rosterConfirmed!==next.legacy36?.rosterConfirmed){
            assert(!old.state.legacy36.rosterConfirmed&&next.legacy36?.rosterConfirmed&&canonicalJSON(reselectRoster(old.state,next.profile.teamID,next.profile.driverID,this.context.catalog))===canonicalJSON(next),'profileImmutable');
          }
          if(!allowProfileReplace&&old.state.profile&&canonicalJSON(old.state.profile)!==canonicalJSON(next.profile)){
            const eligible=old.state.legacy36&&!old.state.legacy36.rosterConfirmed&&next.legacy36?.rosterConfirmed;
            assert(eligible&&canonicalJSON(reselectRoster(old.state,next.profile.teamID,next.profile.driverID,this.context.catalog))===canonicalJSON(next),'profileImmutable');
          }
          value={revision:old.revision+1,state:structuredClone(next)};
          if(canonicalJSON(old.state)===canonicalJSON(next)){value=old;return;}
          if(backupBefore)os.put(structuredClone(old),'pre-legacy36-r'+old.revision);
          os.put(value,'main');
        }catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(failure||tx.error||new Error('storageWriteFailed'));
      tx.onabort=()=>reject(failure||tx.error||new Error('storageWriteAborted'));
    });
    this.revision=record.revision;this.state=structuredClone(record.state);return structuredClone(this.state);
  }
  transact(change){return this.enqueue(async()=>{assert(this.revision!==null,'storeNotLoaded');return this.commit(change,this.revision);});}
  async exportBackup(){
    const state=await this.load();return encodeBackup(state,this.revision,this.context);
  }
  async previewLegacyImport(text){
    await this.load();
    let archiveText=text,keepCurrentRoster=false;
    if(JSON.parse(text)?.kind==='chufaba-pwa-backup'){
      const source=await decodeBackup(text,this.context);
      assert(source.state.legacy36,'unsupportedArchive');
      archiveText=source.state.legacy36.archiveJSON;
      keepCurrentRoster=!!this.state.profile;
    }
    let next=importLegacy36(this.state,archiveText,this.context.catalog);
    if(keepCurrentRoster)next=reselectRoster(next,this.state.profile.teamID,this.state.profile.driverID,this.context.catalog);
    validateState(next,this.context);
    const summary=snapshot(next),preview={state:structuredClone(next),currentRevision:this.revision,summary:{nickname:next.profile.nickname,answered:36,firstCorrect:next.sessions[0].firstAnswers.filter(a=>a.correct).length,points:summary.points,coins:summary.coins,miles:summary.miles,claimed:0,photo:'未合影',roster:'车队和车手可重新选择一次，确认后锁定'}};
    preview.summary.teamID=next.profile.teamID;preview.summary.driverID=next.profile.driverID;
    preview.summary.roster=keepCurrentRoster?'保留本机已确认的名字、车队和车手，不再要求重选':preview.summary.roster;
    this.previews.set(preview,{state:structuredClone(next),expectedRevision:this.revision,legacy:true});return preview;
  }
  importLegacy(preview,{expectedRevision}={}){
    return this.enqueue(async()=>{
      const saved=this.previews.get(preview);assert(saved?.legacy,'importPreviewRequired');assert(expectedRevision===saved.expectedRevision,'revisionConflict');
      const result=await this.commit(old=>{assert(!old.legacy36&&old.sessions.length===0&&old.claimedIDs.length===0,'legacyImportConflict');return structuredClone(saved.state);},expectedRevision,{backupBefore:true});
      this.previews.delete(preview);return result;
    });
  }
  async previewImport(text){
    const preview=await decodeBackup(text,this.context);
    // Read the current revision at preview, never silently overwrite later tab activity.
    try{
      await this.load();preview.currentRevision=this.revision;preview.recovery=false;
      this.previews.set(preview,{state:structuredClone(preview.state),expectedRevision:this.revision});
    }catch(error){
      // Only a successfully-read but invalid record enters recovery. IO/permission failures propagate.
      if(!error.isLocalCorruption)throw error;
      const raw=await this.readRaw();
      try{this.validateRecord(raw);throw new Error('revisionConflict');}catch(recheck){if(recheck.message==='revisionConflict')throw recheck;}
      const signature=rawSignature(raw),token='recovery:'+await sha256(signature);
      preview.currentRevision=token;preview.recovery=true;
      this.previews.set(preview,{state:structuredClone(preview.state),expectedRevision:token,rawSignature:signature});
    }
    return preview;
  }
  async commitRecovery(saved){
    const db=await this.open();
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),os=tx.objectStore('state'),request=os.get('main');let value,failure;
      request.onsuccess=()=>{
        try{
          assert(rawSignature(request.result)===saved.rawSignature,'revisionConflict');
          validateState(saved.state,this.context);
          const oldRevision=request.result?.revision;
          value={revision:Number.isSafeInteger(oldRevision)&&oldRevision>=0&&oldRevision<Number.MAX_SAFE_INTEGER?oldRevision+1:1,state:structuredClone(saved.state)};
          // Retain the original corrupt record, atomically with the confirmed recovery; never discard it.
          os.put({raw:request.result,recoveredAt:new Date().toISOString()},'quarantine-'+globalThis.crypto.randomUUID());
          os.put(value,'main');
        }catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(failure||tx.error||new Error('storageWriteFailed'));tx.onabort=()=>reject(failure||tx.error||new Error('storageWriteAborted'));
    });
    this.revision=record.revision;this.state=structuredClone(record.state);return structuredClone(this.state);
  }
  restore(preview,{expectedRevision}={}){
    return this.enqueue(async()=>{
      const saved=this.previews.get(preview);assert(saved,'importPreviewRequired');
      assert(expectedRevision===saved.expectedRevision,'revisionConflict');
      validateState(saved.state,this.context);
      const result=saved.rawSignature!==undefined?await this.commitRecovery(saved):await this.commit(()=>structuredClone(saved.state),expectedRevision,{allowProfileReplace:true});
      this.previews.delete(preview);return result;
    });
  }
  close(){this.db?.close();this.db=null;}
}

// Fingerprint arbitrary structured-cloneable corruption, including cyclic objects. This is not a backup format.
function rawSignature(value){
  const seen=new Map();
  function encode(v){
    if(v===undefined)return ['undefined'];
    if(v===null||typeof v!=='object')return [typeof v,String(v)];
    if(seen.has(v))return ['ref',seen.get(v)];seen.set(v,seen.size);
    if(v instanceof Date)return ['Date',String(v)];
    if(v instanceof ArrayBuffer)return ['ArrayBuffer',[...new Uint8Array(v)]];
    if(ArrayBuffer.isView(v))return [v.constructor.name,[...new Uint8Array(v.buffer,v.byteOffset,v.byteLength)]];
    if(v instanceof Map)return ['Map',[...v].map(([k,x])=>[encode(k),encode(x)])];
    if(v instanceof Set)return ['Set',[...v].map(encode)];
    return [Array.isArray(v)?'Array':'Object',Object.keys(v).sort().map(k=>[k,encode(v[k])])];
  }
  return JSON.stringify(encode(value));
}
