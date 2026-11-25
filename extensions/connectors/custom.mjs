// Declarative offline REST configuration. Never fetches an endpoint.
export function defineCustomConnector({id,name,method,endpoint,mappings}){
 if(typeof id!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(id)||typeof name!=='string'||!name.trim()||!['GET','POST'].includes(method)||typeof endpoint!=='string'||!Array.isArray(mappings)||!mappings.length)throw new TypeError('Invalid connector configuration');
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new TypeError('HTTPS endpoint without credentials, query or fragment required');
 const seen=new Set();return {id,name,method,endpoint:url.href,synthetic:true,mappings:mappings.map(m=>{if(!m||typeof m.key!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(m.key)||seen.has(m.key)||typeof m.path!=='string'||!m.path.split('.').every(p=>/^[a-zA-Z0-9_]+$/.test(p)&&!['__proto__','constructor','prototype'].includes(p)))throw new TypeError('Invalid mapping');seen.add(m.key);return {key:m.key,path:m.path}})};
}
export function simulateCustomConnector(config,response){
 const c=defineCustomConnector(config);if(!response||typeof response!=='object')throw new TypeError('Sample response required');
 return {synthetic:true,connectorId:c.id,fields:c.mappings.map(m=>{let v=response;for(const p of m.path.split('.'))v=v!==null&&typeof v==='object'&&Object.hasOwn(v,p)?v[p]:undefined;return ['string','number','boolean'].includes(typeof v)&&(typeof v!=='number'||Number.isFinite(v))?{key:m.key,value:v,status:'candidate',evidence:'Synthetic response path: '+m.path}:{key:m.key,status:'missing'}})};
}
