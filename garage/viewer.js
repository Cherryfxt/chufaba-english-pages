import {normalizeLoadout} from './viewer-contract.mjs';
const viewport=document.querySelector('#viewport'),status=document.querySelector('#status');
const retry=document.createElement('button');retry.textContent='重新加载3D赛车';retry.hidden=true;retry.className='retry';status.after(retry);
let car=null,pending=normalizeLoadout({}),generation=0,disposed=false,controller=null;
const send=data=>{if(parent!==window)parent.postMessage(data,location.origin);};
function apply(){if(!car)return;car.setLivery('midnight');for(const slot of ['front','rear','wheels','sidepod']){const value=slot==='rear'&&pending[slot]==='starter'?'R02':pending[slot];car.setPart(slot,value);}car.setLivery(pending.livery);viewport.dataset.loadout=JSON.stringify(pending);send({type:'chufaba-garage-rendered',loadout:{...pending}});}
function onMessage(event){if(event.source!==parent||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;if(event.data.type==='chufaba-garage-render'){try{pending=normalizeLoadout(event.data.loadout);apply();}catch{send({type:'chufaba-garage-error',message:'无效的赛车装配方案。'});}}else if(event.data.type==='chufaba-garage-destroy')destroy();}
window.addEventListener('message',onMessage);
function destroy(){generation++;disposed=true;controller?.abort();controller=null;car?.dispose();car=null;viewport.dataset.ready='false';}
function failure(error){const code=error?.code||error?.name||'render';let message;
 if(code==='timeout')message='赛车模型下载超时，请检查网络后重试。';
 else if(['network','http','invalid'].includes(code))message='赛车模型下载未完成，请重试。';
 else if(/webgl|context/i.test(error?.message||''))message='浏览器未能启动3D渲染，请关闭其他3D页面后重试。';
 else message='赛车预览启动失败，请重试。';
 viewport.dataset.ready='false';viewport.dataset.error=String(code);status.hidden=false;status.textContent=message;retry.hidden=false;
 console.warn('Garage preview failed',code,error?.message);send({type:'chufaba-garage-error',message,code:String(code)});
}
async function start(){destroy();const token=++generation;disposed=false;controller=new AbortController();const signal=controller.signal;retry.hidden=true;status.hidden=false;status.textContent='正在启动3D赛车…';delete viewport.dataset.error;send({type:'chufaba-garage-loading'});
 try{const {createCarScene}=await import('./scene.js?v=garage-recovery-20261025');if(token!==generation||disposed)return;
 const instance=await createCarScene(viewport,{signal,onProgress:p=>{if(token!==generation)return;if(p.stage==='parsing')status.textContent='模型已下载，正在组装赛车…';else if(p.stage==='rendering')status.textContent='正在启动3D渲染…';else{const loaded=(Number(p.loaded||0)/1048576).toFixed(1),total=p.total?(Number(p.total)/1048576).toFixed(1):'25';status.textContent=`正在下载赛车模型 ${loaded} / ${total} MB${p.attempt>1?' · 自动重试中':''}…`;}}});
 if(token!==generation||disposed){instance.dispose();return;}car=instance;car.setLight('studio');apply();car.setView('overview',false);car.zoom(-1);status.hidden=true;viewport.dataset.ready='true';send({type:'chufaba-garage-ready'});
 }catch(error){if(token!==generation||disposed)return;failure(error);}
}
retry.addEventListener('click',start);
document.querySelector('.controls').addEventListener('click',event=>{const button=event.target.closest('button');if(!car||!button)return;if(button.dataset.view){car.setView(button.dataset.view);if(button.dataset.view==='overview')car.zoom(-1);}if(button.dataset.zoom)car.zoom(Number(button.dataset.zoom));});
viewport.addEventListener('car-render-error',()=>{destroy();disposed=false;failure({code:'context-lost',message:'WebGL context lost'});});
window.addEventListener('pagehide',destroy);window.addEventListener('pageshow',event=>{if(event.persisted)start();});start();
