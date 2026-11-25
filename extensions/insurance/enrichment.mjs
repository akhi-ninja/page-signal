// Synthetic-only connector contract. Live adapters require separate security and licensing review.
export async function enrichSynthetic({requests,providers,maxCalls=10,timeoutMs=1000}){
 if(!Array.isArray(requests)||!Array.isArray(providers)||!Number.isSafeInteger(maxCalls)||maxCalls<0||maxCalls>100||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new TypeError('Invalid enrichment configuration');
 const registry=new Map();
 for(const p of providers){if(typeof p.id!=='string'||!p.id||registry.has(p.id)||p.synthetic!==true||typeof p.lookup!=='function')throw new TypeError('Invalid synthetic provider');registry.set(p.id,p)}
 let calls=0;const results=[];
 for(const q of requests){
  if(!q||typeof q.provider!=='string'||typeof q.field!=='string'||typeof q.subject!=='string'||!q.subject||q.synthetic!==true)throw new TypeError('Synthetic request required');
  const base={provider:q.provider,field:q.field,subject:q.subject,synthetic:true};
  const p=registry.get(q.provider);
  if(!p||calls>=maxCalls){results.push({...base,status:p?'budget_exhausted':'unavailable'});continue}
  calls++;const controller=new AbortController();let timer;
  try{
   const value=await Promise.race([Promise.resolve().then(()=>p.lookup({field:q.field,subject:q.subject,signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'))},timeoutMs)})]);
   if(!value||typeof value.evidence!=='string'||!value.evidence.trim()||!['string','number','boolean'].includes(typeof value.value)||(typeof value.value==='number'&&!Number.isFinite(value.value)))throw Error('invalid evidence');
   results.push({...base,status:'candidate',value:value.value,evidence:value.evidence,retrievedAt:new Date().toISOString()});
  }catch{results.push({...base,status:'unavailable'})}finally{clearTimeout(timer)}
 }
 const groups=new Map();for(const x of results.filter(x=>x.status==='candidate')){const key=JSON.stringify([x.subject,x.field]);const g=groups.get(key)||[];g.push(x);groups.set(key,g)}
 const findings=[];for(const g of groups.values())if(new Set(g.map(x=>JSON.stringify(x.value))).size>1)findings.push({subject:g[0].subject,field:g[0].field,reason:'conflicting_candidates',providers:g.map(x=>x.provider)});
 return {synthetic:true,calls,results,findings,status:'needs_review'};
}
