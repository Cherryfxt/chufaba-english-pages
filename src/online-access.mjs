// Public resources are constrained to this Pages project; no credentials sent.
const BASE=new URL('../',import.meta.url);
const listeners=new Set();
export const hasAccess=()=>true;
export async function ensureAccess(){return true;}
export function onRequestStatus(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function report(value){for(const fn of listeners){try{fn(value);}catch{}}}
export function resourceURL(url){
  const target=new URL(url,BASE);
  if(target.origin!==BASE.origin||!target.pathname.startsWith(BASE.pathname)||target.username||target.password||/%(?:2f|5c)/i.test(target.pathname))throw new Error('禁止访问项目外资源');
  return target;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function protectedFetch(url,options={}){
  const target=resourceURL(url),filename=target.pathname.slice(BASE.pathname.length);
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController();let timer,timedOut=false,httpStatus;
    const cancel=()=>controller.abort(options.signal?.reason);
    if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true});
    report({filename,attempt,phase:'loading',message:`正在读取 ${filename}（第 ${attempt}/3 次）`});
    try{
      const work=(async()=>{
        const response=await fetch(target,{...options,cache:'no-store',redirect:'error',credentials:'omit',signal:controller.signal});
        if(!response.ok||response.redirected||response.status===206){httpStatus=response.status;throw new Error(`HTTP ${response.status}`);}
        // Timeout remains active until the entire body has arrived.
        const body=await response.arrayBuffer();
        return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
      })();
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error('timeout'));},45000);});
      const result=await Promise.race([work,deadline]);
      report({filename,attempt,phase:'loaded',message:`已读取 ${filename}`});return result;
    }catch(error){
      const reason=timedOut?'timeout（45 秒超时）':options.signal?.aborted?'cancelled（已取消）':httpStatus?`HTTP ${httpStatus}`:`network（${error?.message||'网络连接失败'}）`;
      const message=`${filename}：${reason}；第 ${attempt}/3 次尝试失败`;
      const retry=attempt<3&&httpStatus!==404&&!options.signal?.aborted;
      report({filename,attempt,phase:retry?'retry':'error',message:message+(retry?`，${attempt} 秒后重试`:'；本机记录和当前输入保留')});
      if(!retry)throw new Error(message,{cause:error});
    }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
    await pause(attempt*1000);
  }
}
