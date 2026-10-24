// Closing is presentation-only: it never settles learning points or claims rewards.
export const QUOTE_RATE=0.85;
export function validateQuotes(data){
 if(data?.schemaVersion!==1||!Array.isArray(data.stations)||data.stations.length!==126)throw new Error('本站寄语内容不完整');
 const map=new Map(),ids=new Set(),texts=new Set();
 for(const entry of data.stations){
  const q=entry.quote;
  if(!Number.isInteger(entry.stationID)||entry.stationID<1||entry.stationID>126||map.has(entry.stationID)||!q?.id||ids.has(q.id)||!q.original||texts.has(q.original)||!q.chinese||!q.author||!q.work||!q.locator||!['zh-CN','en-US'].includes(q.language))throw new Error('本站寄语对应关系无效');
  const u=new URL(q.sourceUrl);if(u.protocol!=='https:')throw new Error('寄语出处链接无效');
  if(q.verification?.status!=='verified'||!q.verification.checkedOn)throw new Error('寄语出处尚未核实');
  const clips=entry.audio?.clips;
  if(!Array.isArray(clips)||clips.length!==2||clips[0].text!==q.original||clips[1].text!==q.chinese||clips[0].language!==q.language||clips[1].language!=='zh-CN')throw new Error('寄语朗读顺序无效');
  for(const clip of clips)if(!/^content\/quote-audio\/[a-f0-9]{64}\.mp3$/.test(clip.url)||!Number.isSafeInteger(clip.bytes)||clip.bytes<100||!/^[a-f0-9]{64}$/.test(clip.sha256))throw new Error('寄语音频尚未就绪');
  ids.add(q.id);texts.add(q.original);map.set(entry.stationID,entry);
 }
 return map;
}
export function quoteResources(entry){return entry.audio.clips.map(c=>({url:c.url,bytes:c.bytes,sha256:c.sha256,group:'audio',stationIDs:[entry.stationID]}));}
export class ClosingPlayback {
 constructor(player,{reveal=()=>{},isHidden=()=>false,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){this.player=player;this.reveal=reveal;this.isHidden=isHidden;this.setTimer=setTimer;this.clearTimer=clearTimer;this.generation=0;this.active=false;this.muted=false;}
 enter(entry){this.leave();this.active=true;this.entry=entry;this.muted=false;const generation=this.generation;this.timer=this.setTimer(()=>{if(!this.active||generation!==this.generation)return;this.reveal();if(!this.muted&&!this.isHidden())this.play();},700);}
 play(){if(!this.active||this.muted||!this.entry)return;this.player.play(this.entry.audio.clips.map(c=>c.url),{repeat:1,rate:QUOTE_RATE});}
 replay(){if(!this.active)return;this.clearTimer(this.timer);this.reveal();this.muted=false;this.play();}
 toggleMute(){this.muted=!this.muted;if(this.muted)this.player.stop();else{this.clearTimer(this.timer);this.reveal();this.play();}return this.muted;}
 background(){this.clearTimer(this.timer);if(this.active){this.reveal();this.player.stop();}}
 leave(){this.generation++;this.clearTimer(this.timer);if(this.active)this.player.stop();this.active=false;this.entry=null;}
}
