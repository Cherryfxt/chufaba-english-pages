// Bounded, cancellable GLB transport; no dependency on the renderer.
const error=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
export async function loadCarBytes(url,{onProgress=()=>{},signal,fetchImpl=globalThis.fetch,idleTimeoutMs=20000,attempts=2,maxBytes=64*1024*1024}={}){
 const count=Math.max(1,Math.min(2,Math.floor(attempts)||1));
 maxBytes=Math.min(64*1024*1024,Number.isFinite(maxBytes)&&maxBytes>=12?maxBytes:64*1024*1024);
 idleTimeoutMs=Number.isFinite(idleTimeoutMs)&&idleTimeoutMs>0?idleTimeoutMs:20000;
 const report=event=>{try{onProgress(event);}catch{/* UI observers cannot invalidate an asset. */}};
 for(let attempt=1;attempt<=count;attempt++){
  if(signal?.aborted)throw error('cancelled','3D 模型加载已取消');
  const controller=new AbortController();let timer,reader,timedOut=false,cancelled=false;
  let rejectStop;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  const stop=(isTimeout)=>{timedOut=isTimeout;cancelled=!isTimeout;controller.abort();rejectStop(error(isTimeout?'timeout':'cancelled',isTimeout?'3D 模型下载长时间无响应':'3D 模型加载已取消'));};
  const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>stop(true),idleTimeoutMs);};
  const abort=()=>stop(false);signal?.addEventListener('abort',abort,{once:true});
  const wait=promise=>Promise.race([promise,stopped]);
  let loaded=0,total=0;
  try{
   reset();report({stage:'loading',loaded,total,attempt});
   const response=await wait(fetchImpl(url,{signal:controller.signal}));
   if(!response.ok)throw error('http',`3D 模型请求失败（HTTP ${response.status}）`,{status:response.status,retryable:response.status===408||response.status===429||response.status>=500});
   const length=Number(response.headers?.get('content-length'));
   total=Number.isSafeInteger(length)&&length>0?length:0;
   if(total>maxBytes)throw error('invalid','3D 模型超过安全大小限制',{retryable:false});
   reset();let bytes;
   if(response.body?.getReader){
    reader=response.body.getReader();const chunks=[];
    while(true){
     const {done,value}=await wait(reader.read());if(done)break;
     if(!(value instanceof Uint8Array))throw error('invalid','3D 模型数据格式错误',{retryable:true});
     loaded+=value.byteLength;
     if(loaded>maxBytes)throw error('invalid','3D 模型超过安全大小限制',{retryable:false});
     chunks.push(value);if(value.byteLength)reset();report({stage:'loading',loaded,total,attempt});
    }
    bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   }else{
    bytes=new Uint8Array(await wait(response.arrayBuffer()));loaded=bytes.byteLength;
    if(loaded>maxBytes)throw error('invalid','3D 模型超过安全大小限制',{retryable:false});
    report({stage:'loading',loaded,total,attempt});
   }
   if(bytes.byteLength<12)throw error('invalid','3D 模型文件不完整',{retryable:true});
   const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==bytes.byteLength)throw error('invalid','3D 模型文件校验失败',{retryable:true});
   report({stage:'complete',loaded,total:total||loaded,attempt});return bytes.buffer;
  }catch(cause){
   const failure=signal?.aborted||cancelled?error('cancelled','3D 模型加载已取消'):timedOut?error('timeout','3D 模型下载长时间无响应',{retryable:true}):cause?.code?cause:error('network','3D 模型网络连接失败',{retryable:true,cause});
   controller.abort();if(reader)try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}
   if(failure.code==='cancelled'||!failure.retryable||attempt===count)throw failure;
   report({stage:'retry',loaded,total,attempt,errorCode:failure.code});
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{reader?.releaseLock();}catch{}}
 }
}
