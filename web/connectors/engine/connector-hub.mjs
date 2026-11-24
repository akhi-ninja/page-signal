// Industry-independent offline connector contract. No network or credentials.
const key=v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(v);
export function createConnectorHub(definitions){
 if(!Array.isArray(definitions))throw new TypeError('Definitions required');
 const registry=new Map();
 for(const d of definitions){
 if(!d||!key(d.id)||registry.has(d.id)||typeof d.name!=='string'||!d.name.trim()||typeof d.category!=='string'||d.synthetic!==true||typeof d.execute!=='function')throw new TypeError('Invalid synthetic connector');
 registry.set(d.id,{...d});
 }
 return Object.freeze({
 list:()=>Array.from(registry.values(),({id,name,category})=>({id,name,category,mode:'synthetic'})),
 async test(id,input){
 const d=registry.get(id);if(!d||input?.synthetic!==true)throw new TypeError('Synthetic connector and input required');
 let timer;const controller=new AbortController();
 try{
 const result=await Promise.race([Promise.resolve().then(()=>d.execute(input,controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'))},1000)})]);
 if(!result||!Array.isArray(result.fields)||result.fields.some(f=>!f||!key(f.key)||!['string','number','boolean'].includes(typeof f.value)||typeof f.value==='number'&&!Number.isFinite(f.value)||typeof f.evidence!=='string'||!f.evidence.trim()))throw new Error('Invalid evidence');
 if(new Set(result.fields.map(f=>f.key)).size!==result.fields.length)throw new Error('Duplicate fields');
 return {connectorId:id,synthetic:true,status:'candidate',fields:result.fields.map(({key,value,evidence})=>({key,value,evidence,source:id})),requiresReview:true};
 }catch{return {connectorId:id,synthetic:true,status:'unavailable',fields:[],requiresReview:true}}finally{clearTimeout(timer)}
 }
 });
}
export function mapConnectorFields(result,mappings){
 if(result?.synthetic!==true||result.status!=='candidate'||!Array.isArray(mappings))throw new TypeError('Candidate result and mappings required');
 const seen=new Set();return mappings.map(m=>{
 if(!m||!key(m.source)||!key(m.target)||seen.has(m.target))throw new TypeError('Unique canonical target required');seen.add(m.target);
 const f=result.fields.find(f=>f.key===m.source);
 return f?{...f,canonicalKey:m.target,status:'candidate'}:{canonicalKey:m.target,status:'missing'};
 });
}
