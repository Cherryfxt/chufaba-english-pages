// Business rules ported from the confirmed 2026-10-22 native core. No network or storage.
export const RULE_VERSION = 'chufaba-24q-v1-20261022';
export const HONORS = [
  [1,'正式发车',0,0],[2,'起步新秀',1300,500],[3,'稳定车手',4000,1800],
  [4,'弯道进阶',9000,4200],[5,'赛道骨干',16000,7500],[6,'领跑挑战者',24000,11000],
  [7,'赛季冠军',30000,13000],[8,'传奇车手',36000,15500]
].map(([level,title,points,miles])=>({level,title,points,miles}));
const copy = value => structuredClone(value);
const fail = (code) => { throw new Error(code); };
const check = (condition,code='invalidState') => { if(!condition) fail(code); };
const int = (v,min,max) => Number.isSafeInteger(v)&&v>=min&&v<=max;
const exact = (o, keys) => check(o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join('|')===keys.slice().sort().join('|'));
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const current = s => s.sessions.find(x=>x.stationID===s.activeStationID) || fail('missingSession');
const requireRoute = (s,...routes) => check(routes.includes(s.route),'invalidRoute');
const studyItems = station => station.newItems.length ? station.newItems : station.reviewItems;
export function createState(){return {schemaVersion:1,ruleVersion:RULE_VERSION,profile:null,randomOrder:[],sessions:[],claimedIDs:[],activeStationID:null,route:'activation',feedbackNumbers:[]};}
export function activate(state,{teamID,driverID,nickname,profileID=globalThis.crypto.randomUUID()},catalog){
  check(!state.profile,'alreadyActivated');
  check(catalog.teams.find(t=>t.id===teamID)?.drivers.includes(driverID),'invalidRoster');
  check(typeof nickname==='string' && nickname.trim().length>0 && nickname.trim().length<=40,'invalidNickname');
  const s=copy(state); s.profile={profileID,teamID,driverID,nickname:nickname.trim()};
  // The random pool order is created once, then preserved in every backup.
  s.randomOrder=Array.from({length:45},(_,i)=>i+1);
  for(let i=44;i>0;i--){let n=new Uint32Array(1);globalThis.crypto.getRandomValues(n);const j=n[0]%(i+1);[s.randomOrder[i],s.randomOrder[j]]=[s.randomOrder[j],s.randomOrder[i]];}
  s.route='schedule';return s;
}
function nextRoute(session,showBreak=true){
  if(session.completedDay)return 'result';
  if(!session.formalStarted){
    if(session.studiedCount<session.studyCount)return 'studyCards';
    if(session.warmupAnswers.length<session.warmupCount)return 'warmup';
    return 'readyToStart';
  }
  const count=session.firstAnswers.length;
  if(count===24)return 'readyToFinish';
  return showBreak && count>0 && count%8===0 ? 'lapBreak':'question';
}
export function openStation(state,station,{contentVersion}={}){
  check(state.profile,'notActivated');check(station&&int(station.station,1,126),'invalidStation');
  const s=copy(state);let session=s.sessions.find(x=>x.stationID===station.station);
  if(!session){
    check(!s.sessions.some(x=>!x.completedDay)&&station.station===s.sessions.length+1,'stationLocked');
    check(typeof contentVersion==='string'&&/^formal-v1:sha256:[a-f0-9]{64}$/.test(contentVersion),'contentVersionUnavailable');
    check(station.questions.length===24&&studyItems(station).length>0&&station.warmup.length>0,'invalidContent');
    session={stationID:station.station,contentVersion,attempt:1,studyCount:studyItems(station).length,warmupCount:station.warmup.length,studiedCount:0,warmupAnswers:[],formalStarted:false,firstAnswers:[],completedDay:null};
    s.sessions.push(session);
  }else if(contentVersion){check(session.contentVersion===contentVersion,'contentVersionMismatch');}
  s.activeStationID=session.stationID;s.feedbackNumbers=[];s.route=nextRoute(session);return s;
}
export function advanceStudy(state){requireRoute(state,'studyCards');const s=copy(state),c=current(s);check(c.studiedCount<c.studyCount);c.studiedCount++;s.route=nextRoute(c);return s;}
export function submitWarmup(state,station,answer){
  requireRoute(state,'warmup');const s=copy(state),c=current(s);check(station.station===c.stationID,'stationMismatch');
  const q=station.warmup[c.warmupAnswers.length];check(q&&q.options.some(o=>o.label===answer),'invalidAnswer');
  c.warmupAnswers.push({answer,correct:answer===q.answer});s.route='warmupFeedback';return s;
}
export function advanceWarmup(state){requireRoute(state,'warmupFeedback');const s=copy(state);s.route=nextRoute(current(s));return s;}
export function startFormal(state){requireRoute(state,'readyToStart');const s=copy(state),c=current(s);check(c.studiedCount===c.studyCount&&c.warmupAnswers.length===c.warmupCount,'stationIncomplete');c.formalStarted=true;s.route='question';return s;}
export function grade(question,answer){
  check(typeof answer==='string'&&answer.trim().length>0&&answer.length<=2000,'invalidAnswer');
  if(question.options.length){const a=answer.trim();check(question.options.some(o=>o.label===a),'invalidAnswer');return a===question.answer;}
  const normalize=v=>v.trim().replace(/\s+/gu,' ').toLowerCase();
  return (question.accepted.length?question.accepted:[question.answer]).some(a=>normalize(a)===normalize(answer));
}
function submissionNumbers(station,number){const q=station.questions[number-1];check(q,'invalidQuestion');return q.passageId?station.questions.filter(x=>x.passageId===q.passageId).map(x=>x.id):[number];}
export function submitAnswers(state,station,answers){
  requireRoute(state,'question');const c=current(state);check(station.station===c.stationID,'stationMismatch');
  const numbers=submissionNumbers(station,c.firstAnswers.length+1);
  check(answers&&same(Object.keys(answers).map(Number).sort((a,b)=>a-b),numbers),'incompleteGroup');
  const receipts=numbers.map(number=>({number,answer:answers[number],correct:grade(station.questions[number-1],answers[number])}));
  const s=copy(state);current(s).firstAnswers.push(...receipts);s.feedbackNumbers=numbers;s.route='feedback';return s;
}
export function advance(state){requireRoute(state,'feedback','lapBreak');const s=copy(state);s.route=nextRoute(current(s),state.route!=='lapBreak');s.feedbackNumbers=[];return s;}
export function shanghaiDay(date=new Date()){
  if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)){check(validDay(date),'invalidSettlementDate');return date;}
  const d=new Date(date);check(Number.isFinite(d.getTime()),'invalidSettlementDate');
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function validDay(day){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'1970-01-01')return false;const d=new Date(day+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day;}
export function finish(state,{date=new Date()}={}){
  const c=current(state);if(c.completedDay)return copy(state);
  requireRoute(state,'readyToFinish');check(c.firstAnswers.length===24,'stationIncomplete');
  const day=shanghaiDay(date),previous=settlementEvents(state).at(-1)?.date;
  check(!previous||previous<=day,'invalidSettlementDate');
  const s=copy(state);current(s).completedDay=day;s.route='result';s.feedbackNumbers=[];return s;
}
export function stationSummary(session){
  const firstCorrect=session.firstAnswers.filter(x=>x.correct).length;
  const firstPoints=session.firstAnswers.reduce((n,x)=>n+(x.correct?[10,15,20][Math.floor((x.number-1)/8)]:0),0);
  return {version:RULE_VERSION,firstCorrect,questionCount:24,firstPoints,firstCoinsInQuarters:firstPoints*2,coins:firstPoints/2,miles:firstCorrect>=20?140:firstCorrect>=15?100:0,stars:firstCorrect>=20?3:firstCorrect>=15?2:1,champion:firstCorrect===24};
}
export function remainingMistakes(state,stationID){
  const c=state.sessions.find(x=>x.stationID===stationID);
  if(!c?.completedDay)return [];
  const corrected=new Set((state.correctionEvents||[]).filter(e=>e.stationID===stationID).flatMap(e=>e.receipts.filter(a=>a.correct).map(a=>a.number)));
  return c.firstAnswers.filter(a=>!a.correct&&!corrected.has(a.number)).map(a=>a.number);
}
function correctionGroup(state,station,number){
  const remaining=remainingMistakes(state,station.station);
  return submissionNumbers(station,number).filter(n=>remaining.includes(n));
}
export function openCorrections(state,station){
  const c=state.sessions.find(x=>x.stationID===station.station);check(c?.completedDay,'stationIncomplete');
  const numbers=remainingMistakes(state,station.station);check(numbers.length,'correctionNotNeeded');
  const s=copy(state);s.activeStationID=station.station;s.correctionStart=(s.correctionEvents||[]).length;
  s.feedbackNumbers=correctionGroup(s,station,numbers[0]);s.route='correctionQuestion';return s;
}
export function submitCorrections(state,station,answers,{date=new Date()}={}){
  requireRoute(state,'correctionQuestion');check(current(state).stationID===station.station,'stationMismatch');
  const numbers=state.feedbackNumbers;
  check(numbers.length&&same(Object.keys(answers).map(Number).sort((a,b)=>a-b),numbers),'incompleteGroup');
  check(same(numbers,correctionGroup(state,station,numbers[0])),'correctionNotNeeded');
  const receipts=numbers.map(number=>({number,answer:answers[number],correct:grade(station.questions[number-1],answers[number])}));
  const day=shanghaiDay(date),last=settlementEvents(state).at(-1)?.date;check(!last||day>=last,'invalidSettlementDate');
  const s=copy(state);s.correctionEvents??=[];
  s.correctionEvents.push({stationID:station.station,date:day,afterCompletedStations:s.sessions.filter(x=>x.completedDay).length,receipts});
  s.route='correctionFeedback';return s;
}
export function advanceCorrections(state,station){
  requireRoute(state,'correctionFeedback');check(station.station===current(state).stationID,'stationMismatch');
  const s=copy(state),last=Math.max(...s.feedbackNumbers),next=remainingMistakes(s,station.station).find(n=>n>last);
  s.feedbackNumbers=next?correctionGroup(s,station,next):[];s.route=next?'correctionQuestion':'correctionDone';return s;
}
// First settlements and correction groups replay in their actual order, even when revisiting older stations.
function settlementEvents(state){
  const result=[],counts=new Map(),completed=state.sessions.filter(x=>x.completedDay);
  for(let i=0;i<completed.length;i++){
    const c=completed[i],summary=stationSummary(c);
    result.push({stationID:c.stationID,date:c.completedDay,sourceEventID:`station-${c.stationID}-corrections-0`,points:summary.firstPoints,coins:summary.coins,miles:summary.miles});
    for(const e of (state.correctionEvents||[]).filter(e=>e.afterCompletedStations===i+1)){
      const count=(counts.get(e.stationID)||0)+e.receipts.length;counts.set(e.stationID,count);
      const points=e.receipts.reduce((n,a)=>n+(a.correct?[5,7.5,10][Math.floor((a.number-1)/8)]:0),0);
      result.push({...e,sourceEventID:`station-${e.stationID}-corrections-${count}`,points,coins:points/2,miles:0});
    }
  }
  return result;
}
export function rewards(state){
  let points=0,coins=0,miles=0,dropProgress=0,lockedDropInterval=700,trainingDaysSinceDrop=0,randomCount=0;
  const claims=[],trainingDates=new Set(),dropDates=new Set();
  const add=(id,kind,ordinal,c,title)=>claims.push({id,kind,ordinal,title,sourceStationID:c.stationID,sourceEventID:c.sourceEventID,earnedDate:c.date,claimed:state.claimedIDs.includes(id)});
  for(const c of settlementEvents(state)){
    points+=c.points;coins+=c.coins;miles+=c.miles;dropProgress+=c.points;
    if(!trainingDates.has(c.date)){trainingDates.add(c.date);trainingDaysSinceDrop++;}
    for(const h of HONORS)if(points>=h.points&&miles>=h.miles&&!claims.some(x=>x.id===`honor-${h.level}`))add(`honor-${h.level}`,'honor',h.level,c,h.title);
    if(!claims.some(x=>x.kind==='starterPart'))for(let i=1;i<=3;i++)add(`starter-${i}`,'starterPart',i,c,`入门装备 · ${i}`);
    const enough=dropProgress>=lockedDropInterval;
    if(randomCount<45&&!dropDates.has(c.date)&&(enough||trainingDaysSinceDrop>=5)){
      const n=state.randomOrder[randomCount++];add(`random-${n}`,'randomPart',n,c,`赛季配件 ${n}`);dropDates.add(c.date);
      dropProgress=enough?dropProgress-lockedDropInterval:0;trainingDaysSinceDrop=0;lockedDropInterval=points>=16000?1300:points>=4000?1000:700;
    }
  }
  return {points,coins,miles,claims,dropProgress,lockedDropInterval,trainingDaysSinceDrop};
}
export function claim(state,claimID){check(rewards(state).claims.some(x=>x.id===claimID),'unknownClaim');const s=copy(state);if(!s.claimedIDs.includes(claimID))s.claimedIDs.push(claimID);return s;}
export function returnToSchedule(state){check(state.profile,'notActivated');const s=copy(state);s.activeStationID=null;s.route='schedule';s.feedbackNumbers=[];return s;}
export function restartStation(state){
  const old=current(state);check(!old.completedDay&&state.sessions.at(-1).stationID===old.stationID,'notLatestUnfinishedTask');
  const s=copy(state),c=current(s);c.attempt++;c.studiedCount=0;c.warmupAnswers=[];c.formalStarted=false;c.firstAnswers=[];s.feedbackNumbers=[];s.route='studyCards';return s;
}
function safeQuestion(q,station){return {number:q.id,id:q.id,kind:q.kind,prompt:q.stem,stem:q.stem,options:copy(q.options),hint:q.hint||null,initialLetter:q.initialLetter||null,passageId:q.passageId||null,passageText:station.passages.find(p=>p.id===q.passageId)?.text||null,hasListening:!!q.listenScript};}
export function snapshot(state,station){
  const c=state.sessions.find(x=>x.stationID===state.activeStationID),r=rewards(state);
  const correcting=state.route.startsWith('correction');
  const questionNumbers=state.route==='correctionQuestion'?[...state.feedbackNumbers]:c&&state.route==='question'?(station?submissionNumbers(station,c.firstAnswers.length+1):[c.firstAnswers.length+1]):[];
  const feedback=['feedback','correctionFeedback'].includes(state.route)?state.feedbackNumbers.map(number=>{
    const receipt=correcting?state.correctionEvents.at(-1).receipts.find(x=>x.number===number):c.firstAnswers.find(x=>x.number===number),q=station?.questions[number-1];
    return {...receipt,...(q?{acceptedAnswers:q.options.length?[q.answer]:(q.accepted.length?q.accepted:[q.answer]),explanation:q.explanation,parentExplanation:q.parentExplanation,translation:copy(q.translation),listenScript:q.listenScript||null,passageTranslation:copy(station.passages.find(p=>p.id===q.passageId)?.parallelText||[])}:{})};
  }):[];
  const allEvents=settlementEvents(state),corrections=allEvents.filter(e=>e.receipts),run=correcting?corrections.slice(state.correctionStart??corrections.length):[];
  const correctionRun={corrected:run.reduce((n,e)=>n+e.receipts.filter(a=>a.correct).length,0),points:run.reduce((n,e)=>n+e.points,0),coins:run.reduce((n,e)=>n+e.coins,0),eventIDs:run.map(e=>e.sourceEventID)};
  const rewardEventIDs=correcting?correctionRun.eventIDs:c?[`station-${c.stationID}-corrections-0`]:[];
  return {route:state.route,profile:copy(state.profile),stationID:c?.stationID??null,contentVersion:c?.contentVersion??null,studyIndex:c?.studiedCount??0,warmupIndex:state.route==='warmupFeedback'?(c?.warmupAnswers.length??1)-1:(c?.warmupAnswers.length??0),warmupAnswer:copy(c?.warmupAnswers.at(-1)||null),questionNumbers,questions:station?questionNumbers.map(n=>safeQuestion(station.questions[n-1],station)):[],feedback,correctionRun,rewardEventIDs,rewardEventID:rewardEventIDs.at(-1)||null,remainingMistakes:c?remainingMistakes(state,c.stationID):[],answered:c?.firstAnswers.length??0,questionCount:24,result:c?.completedDay?stationSummary(c):null,currentStationID:state.sessions.find(x=>!x.completedDay)?.stationID??(state.sessions.length<126?state.sessions.length+1:null),completedStationIDs:state.sessions.filter(x=>x.completedDay).map(x=>x.stationID),...r,pendingHonors:r.claims.filter(x=>x.kind==='honor'&&!x.claimed),pendingParts:r.claims.filter(x=>x.kind!=='honor'&&!x.claimed),honorsDot:r.claims.some(x=>x.kind==='honor'&&!x.claimed),garageDot:r.claims.some(x=>x.kind!=='honor'&&!x.claimed)};
}
function lookup(map,key){return map instanceof Map?map.get(key):map?.[key];}
/** Regrades every receipt against the shipped, version-bound source. Never trusts balances in a backup. */
export function validateState(state,{catalog,stations,contentVersions}){
  exact(state,['schemaVersion','ruleVersion','profile','randomOrder','sessions','claimedIDs','activeStationID','route','feedbackNumbers',...['correctionEvents','correctionStart'].filter(k=>Object.hasOwn(state,k))]);
  check(state.schemaVersion===1&&state.ruleVersion===RULE_VERSION,'unsupportedArchive');
  check(Array.isArray(state.sessions)&&state.sessions.length<=126&&Array.isArray(state.claimedIDs)&&Array.isArray(state.randomOrder)&&Array.isArray(state.feedbackNumbers));
  if(!state.profile){check(same(state,createState()),'invalidUnactivatedState');return true;}
  exact(state.profile,['profileID','teamID','driverID','nickname']);const p=state.profile;
  check(typeof p.profileID==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.profileID),'invalidProfile');
  check(catalog.teams.find(t=>t.id===p.teamID)?.drivers.includes(p.driverID),'invalidRoster');
  check(typeof p.nickname==='string'&&p.nickname===p.nickname.trim()&&p.nickname.length>0&&p.nickname.length<=40,'invalidNickname');
  check(same([...state.randomOrder].sort((a,b)=>a-b),Array.from({length:45},(_,i)=>i+1)),'invalidRandomOrder');
  let previousDay='';
  for(let i=0;i<state.sessions.length;i++){
    const c=state.sessions[i];exact(c,['stationID','contentVersion','attempt','studyCount','warmupCount','studiedCount','warmupAnswers','formalStarted','firstAnswers','completedDay']);
    check(c.stationID===i+1,'invalidStationOrder');const station=lookup(stations,c.stationID);check(station,'contentUnavailable');
    check(c.contentVersion===lookup(contentVersions,c.stationID),'contentVersionMismatch');
    check(int(c.attempt,1,1000000)&&c.studyCount===studyItems(station).length&&c.warmupCount===station.warmup.length&&int(c.studiedCount,0,c.studyCount));
    check(Array.isArray(c.warmupAnswers)&&c.warmupAnswers.length<=c.warmupCount&&typeof c.formalStarted==='boolean'&&Array.isArray(c.firstAnswers)&&c.firstAnswers.length<=24);
    if(c.warmupAnswers.length)check(c.studiedCount===c.studyCount);
    for(let j=0;j<c.warmupAnswers.length;j++){
      const a=c.warmupAnswers[j],q=station.warmup[j];exact(a,['answer','correct']);check(q.options.some(o=>o.label===a.answer)&&a.correct===(a.answer===q.answer),'invalidWarmupReceipt');
    }
    if(c.formalStarted)check(c.studiedCount===c.studyCount&&c.warmupAnswers.length===c.warmupCount);
    if(c.firstAnswers.length)check(c.formalStarted);
    for(let j=0;j<c.firstAnswers.length;j++){
      const a=c.firstAnswers[j];exact(a,['number','answer','correct']);check(a.number===j+1&&a.correct===grade(station.questions[j],a.answer),'invalidAnswerReceipt');
    }
    // Both reading groups are atomic, including in an imported backup.
    check(![17,18,19,21,22,23].includes(c.firstAnswers.length),'partialReadingGroup');
    if(c.completedDay!==null){check(validDay(c.completedDay)&&c.completedDay>=previousDay&&c.firstAnswers.length===24,'invalidSettlementDate');previousDay=c.completedDay;}
    else check(i===state.sessions.length-1,'multipleUnfinished');
  }
  const events=state.correctionEvents||[];
  if(Object.hasOwn(state,'correctionEvents'))check(Array.isArray(state.correctionEvents),'invalidCorrections');
  check(Array.isArray(events)&&events.length<=20000,'invalidCorrections');
  if(Object.hasOwn(state,'correctionStart'))check(int(state.correctionStart,0,events.length),'invalidCorrectionStart');
  const replay={...state,correctionEvents:[]};let previousCount=0;
  for(const e of events){
    exact(e,['stationID','date','afterCompletedStations','receipts']);
    check(int(e.stationID,1,state.sessions.length)&&int(e.afterCompletedStations,1,state.sessions.filter(x=>x.completedDay).length)&&e.afterCompletedStations>=previousCount,'invalidCorrectionOrder');
    previousCount=e.afterCompletedStations;
    const c=state.sessions[e.stationID-1],station=lookup(stations,e.stationID);
    check(c.completedDay&&e.stationID<=e.afterCompletedStations&&validDay(e.date)&&Array.isArray(e.receipts)&&e.receipts.length>=1&&e.receipts.length<=4,'invalidCorrectionEvent');
    const first=e.receipts[0]?.number;check(int(first,1,24),'invalidCorrectionQuestion');
    check(same(e.receipts.map(a=>a.number),correctionGroup(replay,station,first)),'invalidCorrectionGroup');
    for(const a of e.receipts){exact(a,['number','answer','correct']);check(a.correct===grade(station.questions[a.number-1],a.answer),'invalidCorrectionReceipt');}
    replay.correctionEvents.push(e);
  }
  let priorDate='';for(const e of settlementEvents(state)){check(e.date>=priorDate,'invalidSettlementDate');priorDate=e.date;}
  check(state.claimedIDs.every(id=>typeof id==='string')&&new Set(state.claimedIDs).size===state.claimedIDs.length);
  const generated=new Set(rewards(state).claims.map(x=>x.id));check(state.claimedIDs.every(id=>generated.has(id)),'unearnedClaim');
  if(state.activeStationID===null){check(state.route==='schedule'&&state.feedbackNumbers.length===0);return true;}
  const c=current(state),base=nextRoute(c),allowed=new Set([base]);
  if(state.route.startsWith('correction')){
    check(c.completedDay&&int(state.correctionStart,0,events.length),'invalidCorrectionRoute');
    const run=events.slice(state.correctionStart);check(run.every(e=>e.stationID===c.stationID),'invalidCorrectionRun');
    if(state.route==='correctionQuestion'){
      check(state.feedbackNumbers.length>0&&same(state.feedbackNumbers,correctionGroup(state,lookup(stations,c.stationID),state.feedbackNumbers[0])),'invalidCorrectionGroup');
    }else if(state.route==='correctionFeedback'){
      check(run.length>0&&same(state.feedbackNumbers,run.at(-1).receipts.map(a=>a.number)),'invalidFeedback');
    }else if(state.route==='correctionDone')check(run.length>0&&state.feedbackNumbers.length===0,'invalidCorrectionRun');
    else fail('invalidCorrectionRoute');
    return true;
  }
  if(base==='lapBreak')allowed.add('question');
  if(c.formalStarted&&c.firstAnswers.length&&!c.completedDay)allowed.add('feedback');
  if(!c.formalStarted&&c.warmupAnswers.length&&c.studiedCount===c.studyCount)allowed.add('warmupFeedback');
  check(allowed.has(state.route),'invalidRoute');
  if(state.route==='feedback'){
    const station=lookup(stations,c.stationID),last=c.firstAnswers.at(-1).number;
    check(same(state.feedbackNumbers,submissionNumbers(station,last)),'invalidFeedback');
  }else check(state.feedbackNumbers.length===0,'invalidFeedback');
  return true;
}
