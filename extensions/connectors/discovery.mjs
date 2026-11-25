// Offline evidence boundary for an externally supplied semantic model. No network or AI provider is bundled.
export function discoverPaths(response){
 const out=[];function walk(v,path,depth){if(depth>20||out.length>=2000)throw new RangeError('Response exceeds discovery limits');if(v!==null&&typeof v==='object'){for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))continue;walk(v[k],[...path,k],depth+1)}}else if(['string','boolean','number'].includes(typeof v)&& (typeof v!=='number'||Number.isFinite(v)))out.push({path,value:v});}walk(response,[],0);return out;
}
export async function discoverField({target,sources,propose}){
 if(typeof target?.definition!=='string'||!target.definition.trim()||!['number','string','boolean'].includes(target.type)||!Array.isArray(sources)||sources.length>20||typeof propose!=='function')throw new TypeError('Target, sources and semantic proposer required');
 const seen=new Set(),evidence=[];for(const s of sources){if(typeof s.id!=='string'||!s.id||seen.has(s.id))throw new TypeError('Unique source required');seen.add(s.id);for(const f of discoverPaths(s.response))evidence.push({id:String(evidence.length),source:s.id,...f});}
 const proposals=await propose({target:structuredClone(target),evidence:structuredClone(evidence)});
 if(!Array.isArray(proposals)||proposals.length>evidence.length)throw new TypeError('Invalid proposals');
 const used=new Set(),candidates=[];for(const p of proposals){const e=evidence.find(x=>x.id===p?.id);if(!e||used.has(e.id)||typeof p.reason!=='string'||!p.reason.trim()||!['match','possible','not_match'].includes(p.relevance))throw new TypeError('Invalid evidence reference');used.add(e.id);candidates.push({...e,reason:p.reason,relevance:p.relevance,eligible:p.relevance==='match'&&typeof e.value===target.type});}
 const matches=candidates.filter(c=>c.eligible),distinct=new Set(matches.map(c=>JSON.stringify(c.value)));
 return {status:matches.length===0?'unresolved':distinct.size>1?'conflict':'candidate',recommended:distinct.size===1?matches[0]:null,candidates,unassessedCount:evidence.length-used.size,requiresReview:true};
}
