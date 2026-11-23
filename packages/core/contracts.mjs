/** Browser-safe, opt-in versioned contracts. Legacy extraction responses remain unchanged. */
import {validatePageResult,reconcileDocument} from './document.mjs';
export {validatePageResult};
export const RESULT_VERSIONS=Object.freeze({page:'pagesignal.page.v1',document:'pagesignal.document.v1',query:'pagesignal.query.v1',error:'pagesignal.error.v1'});
const scalar=v=>v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=message=>{throw new TypeError(message);};
const normalized=v=>typeof v==='string'?v.replace(/\s+/gu,' ').trim():v;
const key=f=>JSON.stringify([f.section??null,f.label]);
export function validateEvidence(source){
 if(!object(source)||!Number.isInteger(source.page)||source.page<1||source.page>40||(source.excerpt!==null&&typeof source.excerpt!=='string'))fail('Invalid page evidence');
 if(source.box!==undefined){const b=source.box;if(!object(b)||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1||b.y+b.height>1||source.coordinate_system!=='normalized_upright_page')fail('Invalid source coordinates');}
 return source;
}
export function validateTable(table){
 if(!object(table)||(table.title!==undefined&&table.title!==null&&typeof table.title!=='string')||!Array.isArray(table.columns)||!table.columns.every(c=>typeof c==='string')||!Array.isArray(table.rows)||table.rows.some(r=>!Array.isArray(r)||r.length!==table.columns.length||!r.every(v=>v===null||typeof v==='string')))fail('Invalid table');return table;
}
export function validateQueryResult(query){
 if(!object(query)||typeof query.answer!=='string'||!Array.isArray(query.citations)||!Array.isArray(query.fields))fail('Invalid query result');
 query.citations.forEach(validateEvidence);
 for(const f of query.fields){if(!object(f)||typeof f.label!=='string'||!scalar(f.value)||!(f.source===null||object(f.source)))fail('Invalid query field');if(f.source)validateEvidence(f.source);if(f.value===null&&f.source!==null)fail('Absent query values cannot carry evidence');}
 return query;
}
export function validateErrorResult(error){
 if(!object(error)||typeof error.error!=='string'||typeof error.code!=='string'||!/^[-a-z0-9_]{1,80}$/.test(error.code)||typeof error.retryable!=='boolean'||(error.retry_after_seconds!==undefined&&error.retry_after_seconds!==null&&(!Number.isFinite(error.retry_after_seconds)||error.retry_after_seconds<0||error.retry_after_seconds>300)))fail('Invalid error result');return error;
}
function metadata(options={}){
 const value={};for(const name of ['model','prompt_version','source_revision'])if(options[name]!==undefined){if(typeof options[name]!=='string'||!options[name]||options[name].length>160)fail('Invalid metadata');value[name]=options[name];}return value;
}
export function toPageEnvelope(result,options={}){
 validatePageResult(result);result.tables.forEach(validateTable);const page=options.page??1;if(!Number.isInteger(page)||page<1||page>40)fail('Invalid page number');
 const copy=structuredClone(result),occurrences=new Map();
 copy.fields=copy.fields.map(f=>{const k=key(f),n=occurrences.get(k)||0;occurrences.set(k,n+1);const source=f.source??{page,excerpt:f.evidence};validateEvidence(source);if(source.page!==page)fail('Field evidence must refer to its source page');return {...f,id:`p${page}:${encodeURIComponent(k)}:${n}`,original_value:f.original_value!==undefined?f.original_value:f.value,normalized_value:normalized(f.value),review_state:f.reviewed||f.review_state==='manually_reviewed'?'manually_reviewed':f.state==='illegible'?'illegible':f.state==='blank'?'blank':'needs_review',source};});
 return {schema_version:RESULT_VERSIONS.page,page,result:copy,metadata:metadata(options)};
}
export function toQueryEnvelope(query,options={}){
 validateQueryResult(query);const copy=structuredClone(query),occurrences=new Map();
 copy.fields=copy.fields.map(f=>{const n=occurrences.get(f.label)||0;occurrences.set(f.label,n+1);return {...f,id:`query:${encodeURIComponent(f.label)}:${n}`,review_state:f.value===null?'not_found':'needs_review'};});return {schema_version:RESULT_VERSIONS.query,result:copy,metadata:metadata(options)};
}
export function toDocumentEnvelope(pages,options={}){
 if(!Array.isArray(pages)||pages.some(p=>!object(p)||Boolean(p.result)===Boolean(p.error)||(p.error&&(!object(p.error)||typeof p.error.code!=='string'||!/^[-a-z0-9_]{1,80}$/.test(p.error.code)))))fail('Each page needs exactly one valid result or typed error');
 const result=reconcileDocument(pages);result.metadata=metadata(options);return result;
}
export function toErrorEnvelope(error){validateErrorResult(error);return {schema_version:RESULT_VERSIONS.error,...structuredClone(error)};}
export function validateEnvelope(value){
 if(!object(value))fail('Invalid result envelope');
 switch(value.schema_version){
  case RESULT_VERSIONS.page:{const expected=toPageEnvelope(value.result,{page:value.page,...value.metadata});if(value.result.fields.some((f,i)=>f.id!==expected.result.fields[i].id||f.review_state!==expected.result.fields[i].review_state||f.normalized_value!==expected.result.fields[i].normalized_value))fail('Invalid field identity or review state');return value;}
  case RESULT_VERSIONS.query:{const expected=toQueryEnvelope(value.result,value.metadata);if(value.result.fields.some((f,i)=>f.id!==expected.result.fields[i].id||f.review_state!==expected.result.fields[i].review_state))fail('Invalid query field identity or review state');return value;}
  case RESULT_VERSIONS.document:{if(!['needs_review','approved'].includes(value.status))fail('Invalid review state');const expected=toDocumentEnvelope(value.pages,value.metadata);if(!Array.isArray(value.documents)||JSON.stringify(value.documents)!==JSON.stringify(expected.documents))fail('Document reconciliation does not match source pages');metadata(value.metadata);return value;}
  case RESULT_VERSIONS.error:return validateErrorResult(value);
  default:fail('Unsupported schema version; explicit migration required');
 }
}
/** Explicitly migrate legacy shapes; never guess whether fields are page or query results. */
export function migrateLegacyResult(value,{kind,...options}){
 if(kind==='page')return toPageEnvelope(value,options);
 if(kind==='query')return toQueryEnvelope(value,options);
 if(kind==='document')return toDocumentEnvelope(value,options);
 if(kind==='error')return toErrorEnvelope(value);
 if(kind==='workspace-v3'){
  if(value?.schema_version!=='3.0'||!Array.isArray(value.pages)||!value.pages.length)fail('A hosted AI workspace v3 export with pages is required');
  return toDocumentEnvelope(value.pages.map(p=>p.error?{page:p.page,error:{code:'page_failed'}}:{page:p.page,result:p}),options);
 }
 fail('Unsupported legacy result kind');
}
/** Keep query fields in an explicit namespace; a matching label never overwrites extraction. */
export function mergeRequestedFields(existing,query,{queryId}={}){
 if(!Array.isArray(existing)||existing.some(f=>!object(f)||typeof f.id!=='string')||new Set(existing.map(f=>f.id)).size!==existing.length||typeof queryId!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(queryId))fail('Unique extraction IDs and queryId required');
 const fields=toQueryEnvelope(query).result.fields.map(f=>({...f,id:`${queryId}:${f.id}`}));
 if(fields.some(f=>existing.some(e=>e.id===f.id)))fail('Query ID already merged');return [...structuredClone(existing),...fields];
}
