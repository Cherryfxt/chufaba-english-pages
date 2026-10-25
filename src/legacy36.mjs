// Only an integrity digest is public. The source record must be supplied privately
// by its owner and is retained byte-for-byte in the device-local learning archive.
export const LEGACY36_HASH='ca516debb8ef9ca9d38be26bcda57aca0c86d3416d6a98bcf8131404b9699b15';
export const LEGACY36_VERSION=`legacy36-v1:sha256:${LEGACY36_HASH}`;
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotate=(x,n)=>(x>>>n)|(x<<(32-n));
export function sha256(text){
  const bytes=new TextEncoder().encode(text),size=Math.ceil((bytes.length+9)/64)*64,data=new Uint8Array(size),view=new DataView(data.buffer);
  data.set(bytes);data[bytes.length]=128;view.setUint32(size-8,Math.floor(bytes.length/0x20000000));view.setUint32(size-4,(bytes.length*8)>>>0);
  const hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
  for(let offset=0;offset<size;offset+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+w[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,h]=hash;
    for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>{hash[i]=(hash[i]+v)>>>0;});
  }
  return Array.from(hash,v=>v.toString(16).padStart(8,'0')).join('');
}
export function readLegacy36(archiveJSON){
  if(typeof archiveJSON!=='string'||archiveJSON.length>200000||sha256(archiveJSON)!==LEGACY36_HASH)throw new Error('legacyArchiveMismatch');
  return JSON.parse(archiveJSON);
}
export function legacy36Projection(archive){
  const day=archive.station.completedAtLocal.slice(0,10);
  return {
    session:{stationID:1,contentVersion:LEGACY36_VERSION,attempt:1,studyCount:archive.learning.words.length,warmupCount:archive.warmup.totalQuestions,studiedCount:archive.learning.words.length,warmupAnswers:Object.values(archive.warmup.answers).map(a=>({answer:a.value,correct:a.correct})),formalStarted:true,firstAnswers:archive.attempts.map(a=>({number:a.questionId,answer:a.originalAttempt.value,correct:a.originalAttempt.correct})),completedDay:day},
    correctionEvents:archive.attempts.filter(a=>a.correction).sort((a,b)=>a.correction.submittedAt.localeCompare(b.correction.submittedAt)).map(a=>({stationID:1,date:a.correction.submittedAtLocal.slice(0,10),afterCompletedStations:1,receipts:[{number:a.questionId,answer:a.correction.value,correct:a.correction.correct}]}))
  };
}
