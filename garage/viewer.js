import {createCarScene} from './scene.js';
import {normalizeLoadout} from './viewer-contract.mjs';
const viewport=document.querySelector('#viewport'),status=document.querySelector('#status');
let car=null,pending=normalizeLoadout({}),generation=0,disposed=false;
const send=data=>{if(parent!==window)parent.postMessage(data,location.origin);};
function apply(){if(!car)return;car.setLivery('midnight');for(const slot of ['front','rear','wheels','sidepod']){const value=slot==='rear'&&pending[slot]==='starter'?'R02':pending[slot];car.setPart(slot,value);}car.setLivery(pending.livery);viewport.dataset.loadout=JSON.stringify(pending);send({type:'chufaba-garage-rendered',loadout:{...pending}});}
function onMessage(event){if(event.source!==parent||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;if(event.data.type==='chufaba-garage-render'){try{pending=normalizeLoadout(event.data.loadout);apply();}catch{send({type:'chufaba-garage-error',message:'无效的赛车装配方案。'});}}else if(event.data.type==='chufaba-garage-destroy')destroy();}
window.addEventListener('message',onMessage);
function destroy(){generation++;disposed=true;car?.dispose();car=null;viewport.dataset.ready='false';}
async function start(){const token=++generation;disposed=false;status.hidden=false;try{const instance=await createCarScene(viewport);if(token!==generation||disposed){instance.dispose();return;}car=instance;car.setLight('studio');apply();car.setView('overview',false);car.zoom(-1);status.hidden=true;viewport.dataset.ready='true';send({type:'chufaba-garage-ready'});}catch(error){if(token!==generation)return;status.textContent='赛车暂时无法加载，请返回后重试。';send({type:'chufaba-garage-error',message:'赛车暂时无法加载。'});}}
document.querySelector('.controls').addEventListener('click',event=>{const button=event.target.closest('button');if(!car||!button)return;if(button.dataset.view){car.setView(button.dataset.view);if(button.dataset.view==='overview')car.zoom(-1);}if(button.dataset.zoom)car.zoom(Number(button.dataset.zoom));});
viewport.addEventListener('car-render-error',()=>{status.hidden=false;status.textContent='三维渲染已暂停，请返回后重试。';send({type:'chufaba-garage-error',message:'三维渲染已暂停。'});});
window.addEventListener('pagehide',destroy);window.addEventListener('pageshow',event=>{if(event.persisted)start();});start();
