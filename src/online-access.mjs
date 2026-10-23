// Public online edition. Resources stay inside this Pages project path.
const BASE=new URL('../',import.meta.url);
export const hasAccess=()=>true;
export async function ensureAccess(){return true;}
export async function protectedFetch(url,options={}){
  const target=new URL(url,BASE);
  if(target.origin!==BASE.origin||!target.pathname.startsWith(BASE.pathname)||target.username||target.password)throw new Error('禁止访问项目外资源');
  if(globalThis.navigator?.onLine===false)throw new Error('网络已断开，请联网重试；本机记录和当前输入保留');
  const response=await fetch(target,{...options,cache:'no-store',redirect:'error',credentials:'omit',signal:options.signal||AbortSignal.timeout(30000)});
  if(!response.ok||response.redirected||response.status===206)throw new Error('在线资源暂时不可用，请联网重试');
  return response;
}
