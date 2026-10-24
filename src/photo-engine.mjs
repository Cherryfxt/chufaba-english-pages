// Local-only photo primitives. No persistence, uploads or implicit shutter.
import {photoTemplate} from './photo-templates.mjs';
function fault(code,cause){const e=new Error(code,{cause});e.code=code;return e;}
function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function size(image){return [image.videoWidth||image.naturalWidth||image.width,image.videoHeight||image.naturalHeight||image.height];}
function jpeg(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(fault('photoEncodeFailed')),'image/jpeg',.94));}
export class CameraSession{
 constructor(){this.token=0;this.stream=null;this.video=null;this.cancelReady=null;this.facingMode='user';}
 async start(video,{facingMode='user'}={}){
  this.stop();const token=this.token;this.video=video;this.facingMode=facingMode;
  if(!globalThis.navigator?.mediaDevices?.getUserMedia)throw fault('cameraUnavailable');
  let stream;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:1920},height:{ideal:1280}}});
   if(token!==this.token){stream.getTracks().forEach(t=>t.stop());throw fault('cameraCancelled');}
   this.stream=stream;video.srcObject=stream;video.muted=true;video.playsInline=true;
   const ready=new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',check);video.removeEventListener('canplay',check);video.removeEventListener('error',failed);if(this.cancelReady===cancel)this.cancelReady=null;};
    const check=()=>{if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0){cleanup();resolve();}};
    const failed=()=>{cleanup();reject(fault('cameraVideoFailed'));};
    const cancel=()=>{cleanup();reject(fault('cameraCancelled'));};
    this.cancelReady=cancel;video.addEventListener('loadeddata',check);video.addEventListener('canplay',check);video.addEventListener('error',failed);
    timer=setTimeout(()=>{cleanup();reject(fault('cameraNotReady'));},15000);check();
   });
   // Observe readiness immediately so a rejected play promise cannot leave an unhandled rejection.
   await Promise.all([Promise.resolve(video.play()),ready]);
   if(token!==this.token)throw fault('cameraCancelled');
   return {width:video.videoWidth,height:video.videoHeight,mirrored:facingMode==='user'};
  }catch(cause){
   if(token===this.token)this.stop();else stream?.getTracks().forEach(t=>t.stop());
   if(cause.code&&typeof cause.code==='string')throw cause;
   const code={NotAllowedError:'cameraPermissionDenied',SecurityError:'cameraPermissionDenied',NotFoundError:'cameraNotFound',NotReadableError:'cameraBusy',OverconstrainedError:'cameraUnavailable',AbortError:'cameraCancelled'}[cause.name]||'cameraStartFailed';
   throw fault(code,cause);
  }
 }
 captureFrame(){
  const video=this.video;
  if(!this.stream||!video||video.readyState<2||!video.videoWidth||!video.videoHeight)throw fault('cameraNotReady');
  if(!this.stream.getVideoTracks().some(t=>t.readyState==='live'))throw fault('cameraNotReady');
  const frame=canvas(video.videoWidth,video.videoHeight);frame.getContext('2d').drawImage(video,0,0);
  // Snapshot is unmirrored pixels; compositor applies the same mirror as live preview once.
  frame.photoMirrored=this.facingMode==='user';return frame;
 }
 stop(){
  this.token++;this.cancelReady?.();this.cancelReady=null;
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  if(this.video){this.video.pause();this.video.srcObject=null;}this.video=null;
 }
}
function cover(ctx,image,x,y,w,h,mirror){
 const [iw,ih]=size(image);if(!(iw>0&&ih>0))throw fault('photoSourceNotReady');
 const scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale,sx=(iw-sw)/2,sy=(ih-sh)/2;
 ctx.save();if(mirror){ctx.translate(x+w,y);ctx.scale(-1,1);x=0;y=0;}
 ctx.drawImage(image,sx,sy,sw,sh,x,y,w,h);ctx.restore();
}
function wrap(ctx,text,maxWidth){
 // Keep Latin/numeric words together; CJK still wraps character by character.
 // Whitespace stays in the text; only an individually over-wide token is split.
 const lines=[];
 for(const paragraph of String(text??'').split('\n')){
  let line='';
  const tokens=paragraph.match(/[\p{Script=Latin}\p{M}\p{N}]+(?:[’'\-][\p{Script=Latin}\p{M}\p{N}]+)*|\s+|[^\p{Script=Latin}\p{M}\p{N}\s]/gu)||[];
  for(const token of tokens){
   if(ctx.measureText(token).width>maxWidth){
    for(const char of Array.from(token)){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line=char;}else line+=char;}
   }else if(line&&ctx.measureText(line+token).width>maxWidth){lines.push(line);line=token;}
   else line+=token;
  }
  lines.push(line);
 }
 return lines;
}
export async function composePhotos(frameCanvas,{driverImage,driverName='',templateImage,templateID='corner-v4',teamColor='#e0a22a',nickname='',stationID,date,quote}={}){
 const [dw,dh]=size(driverImage||{});if(!(dw>0&&dh>0))throw fault('driverImageNotReady');
 if(!quote?.original||!quote?.chinese||!quote?.author||!quote?.work)throw fault('quoteMissing');
 const template=photoTemplate(templateID);
 if(!size(templateImage||{}).every(n=>n>0))throw fault('photoTemplateNotReady');
 const width=1920,height=1280;
 const cleanCanvas=canvas(width,height),ctx=cleanCanvas.getContext('2d');
 ctx.fillStyle='#14171d';ctx.fillRect(0,0,width,height);
 ctx.save();ctx.scale(1.25,1.25);
 const c=template.camera,d=template.driver;
 cover(ctx,frameCanvas,c.x,c.y,c.w,c.h,frameCanvas.photoMirrored!==false);
 ctx.drawImage(templateImage,0,0,1536,1024);
 // Crop the original photograph from its top edge: a close half-body sticker,
 // never a resynthesized face. This is identical to live CSS cover/center top.
 const scale=Math.max(d.w/dw,d.h/dh),sw=d.w/scale,sh=d.h/scale,sx=(dw-sw)/2;
 ctx.save();ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=18;ctx.shadowOffsetY=8;
 ctx.drawImage(driverImage,sx,0,sw,sh,d.x,d.y,d.w,d.h);ctx.restore();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f6edd8';ctx.font='600 38px sans-serif';ctx.fillText('出发吧！ · 我的高光时刻',...template.labels.title);
 if(template.id==='scene-v4'){
  ctx.fillStyle='rgba(12,26,39,.84)';ctx.beginPath();ctx.roundRect(template.labels.name[0]-200,template.labels.name[1]-24,400,48,12);ctx.fill();
 }
 ctx.fillStyle=template.id==='corner-v4'?'#152638':'#f6edd8';ctx.font='600 26px sans-serif';ctx.fillText(driverName,...template.labels.name);
 ctx.fillStyle='#ead9b5';ctx.font='24px sans-serif';ctx.fillText('每一程，都值得喝彩。',...template.labels.slogan);ctx.restore();
 const layout=canvas(width,1).getContext('2d');layout.font='38px sans-serif';
 const original=wrap(layout,quote.original,width-128),chinese=wrap(layout,quote.chinese,width-128);
 layout.font='34px sans-serif';
 const credit=wrap(layout,`${quote.author} · ${quote.work}${quote.locator?' · '+quote.locator:''}`,width-128);
 const details=wrap(layout,[nickname&&String(nickname),`第${stationID}站`,String(date??'')].filter(Boolean).join(' · '),width-128);
 const footer=64+(original.length+chinese.length)*56+24+credit.length*48+20+details.length*48+48,totalHeight=height+footer;
 if(totalHeight>4096)throw fault('photoTextTooLong');
 const commemorativeCanvas=canvas(width,totalHeight),out=commemorativeCanvas.getContext('2d');out.fillStyle='#14171d';out.fillRect(0,0,width,totalHeight);out.drawImage(cleanCanvas,0,0);
 let y=height+64;out.textBaseline='top';out.fillStyle='#ffffff';out.font='38px sans-serif';
 for(const line of original){out.fillText(line,64,y);y+=56;}
 out.fillStyle='#e5e6e9';for(const line of chinese){out.fillText(line,64,y);y+=56;}
 y+=24;out.font='34px sans-serif';out.fillStyle='#d5b774';for(const line of credit){out.fillText(line,64,y);y+=48;}
 y+=20;out.fillStyle='#c1c6ce';for(const line of details){out.fillText(line,64,y);y+=48;}
 const [clean,commemorative]=await Promise.all([jpeg(cleanCanvas),jpeg(commemorativeCanvas)]);
 return {clean,commemorative,width,height,commemorativeHeight:totalHeight,templateID};
}
export function buildPhotoFiles(record){
 if(!(record?.clean instanceof Blob)||!(record?.commemorative instanceof Blob))throw fault('photoNotReady');
 const safe=value=>String(value??'').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,64)||'photo';
 const base=`chufaba-station-${safe(record.stationID)}-${safe(record.date)}`;
 return [new File([record.clean],`${base}-clean.jpg`,{type:'image/jpeg'}),new File([record.commemorative],`${base}-commemorative.jpg`,{type:'image/jpeg'})];
}
