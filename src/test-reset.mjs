import {createState,validateState} from './domain.mjs';
import {canonicalJSON} from './store.mjs';

const LAST_KEY='pre-reset-last';
const PREFIX='pre-reset-';
const assert=(value,code)=>{if(!value)throw new Error(code);};

// Caller must obtain explicit confirmation first. This function never runs on import.
// Return value and in-memory revision follow Store.transact/restore conventions.
export function resetLocalTestState(store,expectedRevision){
  return store.enqueue(async()=>{
    assert(store.revision!==null,'storeNotLoaded');
    assert(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'revisionConflict');
    const fresh=createState();validateState(fresh,store.context);
    const db=await store.open();
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),os=tx.objectStore('state'),request=os.get('main');
      let result,failure;
      request.onsuccess=()=>{
        try{
          const old=store.validateRecord(request.result);
          assert(old.revision===expectedRevision,'revisionConflict');
          // Repeated confirmation against an already fresh state is a true no-op:
          // preserve the last useful backup and do not advance the revision.
          if(canonicalJSON(old.state)===canonicalJSON(fresh)){result=old;return;}
          assert(old.revision<Number.MAX_SAFE_INTEGER,'revisionOverflow');
          const key=PREFIX+globalThis.crypto.randomUUID();
          const backup={record:structuredClone(old),resetAt:new Date().toISOString()};
          result={revision:old.revision+1,state:structuredClone(fresh)};
          // add, rather than put, prevents accidental replacement of any older backup.
          os.add(backup,key);
          os.put({key},LAST_KEY);
          os.put(result,'main');
        }catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(failure||tx.error||new Error('storageWriteFailed'));
      tx.onabort=()=>reject(failure||tx.error||new Error('storageWriteAborted'));
    });
    store.revision=record.revision;store.state=structuredClone(record.state);
    return structuredClone(store.state);
  });
}

// Reading the backup neither restores it nor changes the active Store revision.
// Use encodeBackup(result.state,result.revision,store.context), then the normal
// previewImport/restore confirmation flow if the user chooses to recover it.
export function readLastResetBackup(store,{prepareState=async()=>{}}={}){
  return store.enqueue(async()=>{
    const db=await store.open();
    const raw=await new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly'),os=tx.objectStore('state'),request=os.get(LAST_KEY);
      let result=null,failure;
      request.onsuccess=()=>{
        try{
          const pointer=request.result;if(pointer===undefined)return;
          assert(pointer&&Object.keys(pointer).length===1&&typeof pointer.key==='string'&&pointer.key.startsWith(PREFIX)&&pointer.key!==LAST_KEY,'invalidResetBackup');
          const backupRequest=os.get(pointer.key);
          backupRequest.onsuccess=()=>{
            try{
              const backup=backupRequest.result;
              assert(backup&&Object.keys(backup).sort().join('|')==='record|resetAt'&&typeof backup.resetAt==='string'&&Number.isFinite(Date.parse(backup.resetAt))&&backup.record!==undefined,'invalidResetBackup');
              result={key:pointer.key,resetAt:backup.resetAt,record:structuredClone(backup.record)};
            }catch(error){failure=error;tx.abort();}
          };
        }catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(failure||tx.error||new Error('storageReadFailed'));
      tx.onabort=()=>reject(failure||tx.error||new Error('storageReadAborted'));
    });
    if(raw===null)return null;
    // Lazy content loading may perform network IO: run it after IDB completes,
    // but within the store queue. Do not expose or trust state until validated.
    await prepareState(structuredClone(raw.record.state));
    const saved=store.validateRecord(raw.record);
    return {key:raw.key,resetAt:raw.resetAt,revision:saved.revision,state:structuredClone(saved.state)};
  });
}
