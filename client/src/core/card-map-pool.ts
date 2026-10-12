// Visible preview leases. Tall rows ensure <=4 simultaneous rows even on desktop.
// No timers, provider data, or persistent images are retained here.
export const CARD_MAP_LIMIT=6;
const waiting=new Map<object,(active:boolean)=>void>();
function update(){let n=0;for(const notify of waiting.values())notify(n++<CARD_MAP_LIMIT);}
export function cardLease(key:object,notify:(active:boolean)=>void){waiting.set(key,notify);update();return()=>{notify(false);waiting.delete(key);update();};}
export function cardPoolSize(){return Math.min(waiting.size,CARD_MAP_LIMIT);}
