// Local-only photo journal. No uploads, external requests, or learning DB writes.
const DB_NAME='chufaba-photos-v1';
const MAX_IMAGE_BYTES=12*1024*1024;
const assert=(condition,code)=>{if(!condition)throw new Error(code);};
const exact=(value,keys)=>assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|'),'invalidPhotoRecord');
function keyFor(profileID,stationID){
  assert(typeof profileID==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileID),'invalidPhotoProfile');
  assert(Number.isSafeInteger(stationID)&&stationID>=1&&stationID<=126,'invalidPhotoStation');
  return [profileID,stationID];
}
function validateImage(image){assert(image instanceof Blob&&image.type==='image/jpeg'&&image.size>0&&image.size<=MAX_IMAGE_BYTES,'invalidPhotoImage');}
const QUOTE_FIELDS=['id','original','chinese','chineseLabel','author','work','locator','language','sourceUrl','sourceTitle','attributionNote'];
export function makeQuoteSnapshot(quote){
  const snapshot=Object.fromEntries(QUOTE_FIELDS.map(key=>[key,quote?.[key]??'']));
  validateQuoteSnapshot(snapshot,quote?.id);return snapshot;
}
function validateQuoteSnapshot(snapshot,quoteID){
  exact(snapshot,QUOTE_FIELDS);
  for(const field of QUOTE_FIELDS)assert(typeof snapshot[field]==='string'&&snapshot[field].length<=12000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(snapshot[field]),'invalidPhotoQuote');
  for(const field of ['id','original','chinese','author','work','language'])assert(snapshot[field].trim().length>0,'invalidPhotoQuote');
  assert(snapshot.id===quoteID,'invalidPhotoQuote');
}
function validateMetadata(metadata){
  exact(metadata,['driverID','teamID','date','quoteID',...(Object.hasOwn(metadata||{},'quoteSnapshot')?['quoteSnapshot']:[])]);
  for(const name of ['driverID','teamID'])assert(typeof metadata[name]==='string'&&metadata[name].length>0&&metadata[name].length<=80&&metadata[name].trim()===metadata[name]&&!/[\u0000-\u001f\u007f]/.test(metadata[name]),'invalidPhotoMetadata');
  assert(typeof metadata.quoteID==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(metadata.quoteID),'invalidPhotoMetadata');
  if(Object.hasOwn(metadata,'quoteSnapshot'))validateQuoteSnapshot(metadata.quoteSnapshot,metadata.quoteID);
  assert(typeof metadata.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(metadata.date),'invalidPhotoDate');
  const parsed=new Date(metadata.date+'T00:00:00.000Z');
  assert(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===metadata.date,'invalidPhotoDate');
}
function validateRecord(record,profileID,stationID){
  if(record===undefined)return null;
  assert(record&&record.profileID===profileID&&record.stationID===stationID,'invalidPhotoRecord');
  if(record.status==='skipped'){exact(record,['profileID','stationID','status']);return record;}
  // Read legacy two-image entries without rewriting or deleting historical data.
  exact(record,['profileID','stationID','status','clean','metadata',...(Object.hasOwn(record,'commemorative')?['commemorative']:[])]);
  assert(record.status==='confirmed','invalidPhotoRecord');validateImage(record.clean);if(Object.hasOwn(record,'commemorative'))validateImage(record.commemorative);validateMetadata(record.metadata);return record;
}
export class PhotoStore{
  constructor({indexedDB=globalThis.indexedDB}={}){this.indexedDB=indexedDB;this.db=null;this.opening=null;}
  async open(){
    if(this.db)return this.db;if(this.opening)return this.opening;
    assert(this.indexedDB,'photoStorageUnavailable');
    this.opening=new Promise((resolve,reject)=>{
      const request=this.indexedDB.open(DB_NAME,1);let failed=false;
      request.onupgradeneeded=()=>request.result.createObjectStore('photos');
      request.onerror=()=>{failed=true;reject(request.error||new Error('photoStorageOpenFailed'));};
      request.onblocked=()=>{failed=true;reject(new Error('photoStorageBlocked'));};
      request.onsuccess=()=>{if(failed){request.result.close();return;}this.db=request.result;this.db.onversionchange=()=>{this.db.close();this.db=null;};resolve(this.db);};
    });
    try{return await this.opening;}finally{this.opening=null;}
  }
  async get(profileID,stationID){
    const key=keyFor(profileID,stationID),db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('photos','readonly'),request=tx.objectStore('photos').get(key);let result,failure;
      request.onsuccess=()=>{try{result=validateRecord(request.result,profileID,stationID);}catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>resolve(result===null?null:structuredClone(result));
      tx.onerror=()=>reject(failure||tx.error||new Error('photoStorageReadFailed'));
      tx.onabort=()=>reject(failure||tx.error||new Error('photoStorageReadAborted'));
    });
  }
  async getConfirmed(profileID,stationID){const record=await this.get(profileID,stationID);return record?.status==='confirmed'?record:null;}
  async confirm(profileID,stationID,{clean,metadata}={}){
    keyFor(profileID,stationID);validateImage(clean);validateMetadata(metadata);
    return this.firstWrite({profileID,stationID,status:'confirmed',clean,metadata:structuredClone(metadata)});
  }
  async skip(profileID,stationID){keyFor(profileID,stationID);return this.firstWrite({profileID,stationID,status:'skipped'});}
  async firstWrite(candidate){
    const {profileID,stationID}=candidate,key=keyFor(profileID,stationID);
    validateRecord(candidate,profileID,stationID);candidate=structuredClone(candidate);
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      // Read and insert share one serializable transaction across tabs/instances.
      const tx=db.transaction('photos','readwrite'),os=tx.objectStore('photos'),request=os.get(key);let result,failure;
      request.onsuccess=()=>{try{
        const previous=validateRecord(request.result,profileID,stationID);
        result=previous||candidate;if(previous===null)os.add(candidate,key);
      }catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>resolve(structuredClone(result));
      tx.onerror=()=>reject(failure||tx.error||new Error('photoStorageWriteFailed'));
      tx.onabort=()=>reject(failure||tx.error||new Error('photoStorageWriteAborted'));
    });
  }
  close(){this.db?.close();this.db=null;}
}
