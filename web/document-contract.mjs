const scalar=x=>x===null||typeof x==='string';
const text=x=>String(x??'').replace(/\s+/gu,' ').trim();
export function validatePageResult(r){
 if(!r||typeof r.document_type!=='string'||!['identified','needs_review','unidentified'].includes(r.classification_status)||!Array.isArray(r.fields)||!Array.isArray(r.tables)||!Array.isArray(r.review_notes)||r.review_notes.some(n=>typeof n!=='string'))throw Error('Invalid page result');
 if((r.form_number!==undefined&&!scalar(r.form_number))||(r.issuer!==undefined&&!scalar(r.issuer))||(r.page_role!==undefined&&!['first','continuation','standalone','unknown'].includes(r.page_role)))throw Error('Invalid page identity');
 for(const f of r.fields)if(!f||typeof f.label!=='string'||!scalar(f.section)||!scalar(f.value)||!scalar(f.evidence)||!['filled','blank','illegible','checked','unchecked'].includes(f.state))throw Error('Invalid field');
 for(const f of r.fields)if((['blank','illegible','unchecked'].includes(f.state)&&f.value!==null)||(f.state==='filled'&&(f.value===null||!f.value.trim())))throw Error('Inconsistent field state');
 for(const t of r.tables)if(!t||!Array.isArray(t.columns)||t.columns.some(c=>typeof c!=='string')||!Array.isArray(t.rows)||t.rows.some(row=>!Array.isArray(row)||row.length!==t.columns.length||row.some(c=>!scalar(c))))throw Error('Invalid table');
 return r;
}
const identity=r=>JSON.stringify([r.document_type,r.form_number??null,r.issuer??null]);
const fieldKey=f=>JSON.stringify([text(f.section),text(f.label)]);
/** No uncertain document merges or cross-page row completion. Original pages and errors are retained. */
export function reconcileDocument(input){
 if(!Array.isArray(input)||!input.length||input.length>40||input.some(p=>!Number.isInteger(p.page)||p.page<1||p.page>40)||new Set(input.map(p=>p.page)).size!==input.length)throw Error('Expected unique page numbers 1–40');
 const pages=structuredClone(input).sort((a,b)=>a.page-b.page),documents=[];let current;
 for(const page of pages){
  if(page.error){documents.push({id:`document-p${page.page}`,pages:[page.page],status:'needs_review',fields:[],conflicts:[],table_continuations:[],errors:[{page:page.page,code:String(page.error.code||'page_failed')}]});current=null;continue;}
  const r=validatePageResult(page.result);
  const continuation=r.page_role==='continuation'&&current&&current.identity===identity(r)&&current.pages.at(-1)===page.page-1;
  if(!continuation){current={id:`document-p${page.page}`,identity:identity(r),pages:[],status:'needs_review',fields:[],conflicts:[],table_continuations:[],errors:[]};documents.push(current);}
  current.pages.push(page.page);const occurrences=new Map();
  for(const f of r.fields){const key=fieldKey(f),n=occurrences.get(key)||0;occurrences.set(key,n+1);current.fields.push({...f,id:`${current.id}:p${page.page}:${encodeURIComponent(key)}:${n}`,original_value:f.original_value??f.value,normalized_value:f.value===null?null:text(f.value),source:{page:page.page,excerpt:f.evidence}});}
  if(continuation){const previous=pages.find(p=>p.page===page.page-1)?.result;
   for(let index=0;index<r.tables.length;index++){
    const table=r.tables[index];const matches=(previous?.tables||[]).map((t,i)=>({t,i})).filter(({t})=>JSON.stringify(t.columns)===JSON.stringify(table.columns)&&t.title===table.title);
    if(matches.length)current.table_continuations.push({from_page:page.page-1,to_page:page.page,from_table_indexes:matches.map(m=>m.i),to_table_index:index,status:'needs_review',reason:matches.length!==1?'ambiguous_table_identity':table.rows.some(row=>row.some(c=>c===null))?'incomplete_rows_not_joined':'matching_headers_require_confirmation'});
   }
  }
 }
 for(const group of documents){const map=new Map();for(const f of group.fields){const k=fieldKey(f);if(!map.has(k))map.set(k,[]);map.get(k).push(f);}
  for(const fields of map.values()){const perPage=new Map();for(const f of fields){const p=f.source.page;perPage.set(p,(perPage.get(p)||0)+1);}if(perPage.size<2||[...perPage.values()].some(n=>n>1))continue;const present=fields.filter(f=>f.value!==null);if(new Set(present.map(f=>text(f.value))).size>1)group.conflicts.push({field_ids:present.map(f=>f.id),reason:'different_values_across_pages',status:'needs_review'});}
  delete group.identity;
 }
 return {schema_version:'pagesignal.document.v1',status:'needs_review',pages,documents,note:'Source-grounded review required. Unknown page boundaries split documents; tables and conflicting values are never silently joined.'};
}
