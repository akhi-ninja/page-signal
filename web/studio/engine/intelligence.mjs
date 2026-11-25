// Offline configuration primitives. No arbitrary code, network or model execution.
const key=x=>typeof x==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(x);
const types=new Set(['string','number','boolean']);
const valid=(v,t)=>typeof v===t&&(t!=='number'||Number.isFinite(v));
export function defineSchema({id,version,fields}){
 if(!key(id)||!Number.isSafeInteger(version)||version<1||!Array.isArray(fields)||!fields.length)throw new TypeError('Invalid schema');
 const seen=new Set();
 return {id,version,fields:fields.map(f=>{if(!f||!key(f.key)||seen.has(f.key)||!types.has(f.type)||typeof f.description!=='string'||!f.description.trim()||typeof f.required!=='boolean')throw new TypeError('Invalid field');seen.add(f.key);return {key:f.key,type:f.type,description:f.description,required:f.required}})};
}
export function validateRecord(schema,record){
 const s=defineSchema(schema);if(!record||typeof record!=='object'||Array.isArray(record))throw new TypeError('Record required');
 return s.fields.flatMap(f=>!Object.hasOwn(record,f.key)?f.required?[{field:f.key,reason:'missing'}]:[]:valid(record[f.key],f.type)?[]:[{field:f.key,reason:'type_mismatch'}]);
}
export function reconcileField({field,candidates,sourcePriority}){
 if(!field||!key(field.key)||!types.has(field.type)||!Array.isArray(candidates)||!Array.isArray(sourcePriority)||new Set(sourcePriority).size!==sourcePriority.length||sourcePriority.some(s=>typeof s!=='string'||!s))throw new TypeError('Invalid reconciliation configuration');
 const eligible=candidates.filter(c=>c&&c.field===field.key&&valid(c.value,field.type)&&typeof c.source==='string'&&sourcePriority.includes(c.source)&&typeof c.evidence==='string'&&c.evidence.trim());
 const ranked=[...eligible].sort((a,b)=>sourcePriority.indexOf(a.source)-sourcePriority.indexOf(b.source));
 const conflict=new Set(ranked.map(c=>JSON.stringify(c.value))).size>1;
 const top=ranked.filter(c=>c.source===ranked[0]?.source);
 const selected=top.length&&new Set(top.map(c=>JSON.stringify(c.value))).size===1?top[0]:null;
 return {field:field.key,status:!selected?'unresolved':conflict?'conflict':'candidate',recommended:selected,eligible:ranked,excludedCount:candidates.length-ranked.length,requiresReview:true};
}
export function evaluateRules({schema,record,rules}){
 const s=defineSchema(schema);if(validateRecord(s,record).length)throw new TypeError('Invalid record');
 if(!Array.isArray(rules))throw new TypeError('Rules required');
 const fields=new Map(s.fields.map(f=>[f.key,f])),ids=new Set();
 return rules.map(r=>{
 if(!r||!key(r.id)||ids.has(r.id)||!Array.isArray(r.all)||!r.all.length||!['refer','request_information','flag'].includes(r.action))throw new TypeError('Invalid rule');ids.add(r.id);
 const checks=r.all.map(c=>{const f=fields.get(c?.field);if(!f||!['eq','gt','lt','missing'].includes(c.op)||c.op!=='missing'&&!valid(c.value,f.type)||['gt','lt'].includes(c.op)&&f.type!=='number')throw new TypeError('Invalid condition');
 const present=Object.hasOwn(record,c.field);const v=present?record[c.field]:undefined;return c.op==='missing'?!present:present&&(c.op==='eq'?v===c.value:c.op==='gt'?v>c.value:v<c.value)});
 return {id:r.id,matched:checks.every(Boolean),action:r.action,checks};
 });
}
