// Cosmetic-only storage. Never writes the learning archive or grants rewards.
export const SLOTS=['front','rear','wheels','sidepod','livery'];
export const initialLoadout=()=>({front:'default',rear:'default',wheels:'default',sidepod:'default',livery:'initial'});
export const storageKey=id=>`chufaba-garage-v1:${encodeURIComponent(String(id))}`;
export function partForClaim(claim,catalog){
 if(claim.kind==='starterPart'){
  const slots=['livery','rear','wheels'],names=['入门涂装','入门尾翼','入门轮组'],slot=slots[claim.ordinal-1];
  return slot?{id:`starter-${claim.ordinal}`,slot,name:names[claim.ordinal-1],code:'starter',thumbnail:'garage/thumbs/entry.jpg',claimID:claim.id}:null;
 }
 if(claim.kind!=='randomPart')return null;
 const item=catalog?.items?.find(i=>i.id===`random-${claim.ordinal}`);
 return item&&SLOTS.includes(item.slot)?{id:item.id,slot:item.slot,name:item.name,code:item.reviewCode,thumbnail:`garage/thumbs/${item.reviewCode}.jpg`,claimID:claim.id}:null;
}
export function inventory(claims,catalog){return(claims||[]).filter(c=>c.claimed===true).map(c=>partForClaim(c,catalog)).filter(Boolean);}
export function validateLoadout(value,claims,catalog){
 const result=initialLoadout(),owned=inventory(claims,catalog);
 for(const slot of SLOTS){const code=value?.[slot];if(code===result[slot]||owned.some(p=>p.slot===slot&&p.code===code))result[slot]=code;}
 return result;
}
export function readAppearance(storage,profileID,claims,catalog){
 if(!profileID)throw new Error('缺少当前赛季身份');
 const raw=storage.getItem(storageKey(profileID));if(!raw)return initialLoadout();
 const record=JSON.parse(raw);if(record.version!==1||record.profileID!==profileID)throw new Error('外观记录无法识别');
 return validateLoadout(record.loadout,claims,catalog);
}
export function saveAppearance(storage,profileID,loadout,claims,catalog){
 if(!profileID)throw new Error('缺少当前赛季身份');
 const valid=validateLoadout(loadout,claims,catalog);
 if(SLOTS.some(s=>valid[s]!==loadout[s]))throw new Error('只能应用已经领取的配件');
 const value=JSON.stringify({version:1,profileID,loadout:valid});storage.setItem(storageKey(profileID),value);
 if(storage.getItem(storageKey(profileID))!==value)throw new Error('外观存储校验失败');
 return valid;
}
