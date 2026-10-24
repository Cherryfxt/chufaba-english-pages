// One immutable geometry contract shared by live preview and saved photographs.
export const PHOTO_SIZE=Object.freeze({width:1536,height:1024});
export const PHOTO_TEMPLATES=Object.freeze([
 {id:'corner-v4',name:'下角探入',camera:{x:60,y:110,w:1440,h:780},driver:{x:70,y:440,w:410,h:450},labels:{title:[768,75],name:[280,925],slogan:[1000,925]}},
 {id:'sidebar-v4',name:'侧栏贴纸',camera:{x:40,y:125,w:1050,h:755},driver:{x:1130,y:240,w:330,h:480},labels:{title:[768,75],name:[1300,765],slogan:[760,940]}},
 {id:'scene-v4',name:'赛道同框',camera:{x:110,y:145,w:790,h:680},driver:{x:930,y:250,w:450,h:600},labels:{title:[768,58],name:[1160,825],slogan:[768,958]}}
].map(t=>Object.freeze({...t,asset:`assets/photo-templates/${t.id}.png`,camera:Object.freeze(t.camera),driver:Object.freeze(t.driver)})));
export function randomPhotoTemplate(random){
 const value=random?random():globalThis.crypto?.getRandomValues?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296:Math.random();
 if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError('invalidPhotoRandom');
 return PHOTO_TEMPLATES[Math.floor(value*PHOTO_TEMPLATES.length)];
}
export function photoTemplate(id){const t=PHOTO_TEMPLATES.find(t=>t.id===id);if(!t)throw new Error('invalidPhotoTemplate');return t;}
export function photoRectStyle(rect){return `left:${rect.x/1536*100}%;top:${rect.y/1024*100}%;width:${rect.w/1536*100}%;height:${rect.h/1024*100}%`;}
