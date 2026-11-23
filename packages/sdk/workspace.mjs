/** Browser-safe state shared by native framework components. No credentials or telemetry. */
export function createWorkspace({adapter, concurrency = 2, maxFiles = 10, maxFileBytes = 30*1024*1024, maxBatchBytes = 100*1024*1024} = {}) {
  if (!adapter || typeof adapter.extract !== 'function') throw new TypeError('An extract adapter is required.');
  for (const [name,value] of Object.entries({concurrency,maxFiles,maxFileBytes,maxBatchBytes})) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer.`);
  }
  let documents = [], selectedId = null, error = '', disposed = false, active = 0, sequence = 0;
  const listeners = new Set(), jobs = new Map(), queries = new Map();
  const notify = () => { if (!disposed) for (const listener of listeners) listener(); };
  const patch = (id,change) => { documents = documents.map(d => d.id === id ? {...d,...change} : d); notify(); };
  const run = () => {
    if (disposed) return;
    while (active < concurrency) {
      const doc = documents.find(d => d.status === 'queued'); if (!doc) break;
      active++;
      const abort = new AbortController(); jobs.set(doc.id,abort); patch(doc.id,{status:'processing'});
      Promise.resolve().then(async () => {
        if (abort.signal.aborted || disposed) return;
        const result=await adapter.extract({file:doc.file,signal:abort.signal});
        if (!result || typeof result !== 'object' || Array.isArray(result) || (result.fields !== undefined && (!Array.isArray(result.fields) || result.fields.some(field=>!field || typeof field.label !== 'string')))) throw new TypeError('Extraction adapter must return an object with optional labeled fields array.');
        if (!abort.signal.aborted && !disposed) patch(doc.id,{status:'complete',result});
      }).catch(failure => {
        if (!abort.signal.aborted && !disposed) patch(doc.id,{status:'error',error:failure?.message || 'Extraction failed.'});
      }).finally(() => { active--; jobs.delete(doc.id); run(); });
    }
  };
  const release = doc => { if(doc.previewUrl) URL.revokeObjectURL(doc.previewUrl); };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return {documents,selectedId,error}; },
    addFiles(files) {
      if (disposed) return;
      const batch = Array.from(files); error = '';
      if (documents.length + batch.length > maxFiles) error = `Maximum ${maxFiles} documents. Remove documents before adding more.`;
      else if (documents.reduce((n,d)=>n+d.file.size,0)+batch.reduce((n,f)=>n+f.size,0)>maxBatchBytes) error = 'The batch exceeds the configured size limit.';
      else for (const file of batch) {
        if (!['application/pdf','image/png','image/jpeg','image/webp','image/bmp'].includes(file.type)) { error = `Unsupported file: ${file.name}. Use PDF, PNG, JPEG, WebP or BMP.`; break; }
        if (!file.size || file.size > maxFileBytes) { error = `File exceeds the configured size limit: ${file.name}.`; break; }
      }
      if (error) { notify(); return; }
      const added = batch.map(file => ({id:String(++sequence),file,name:file.name,previewUrl:URL.createObjectURL(file),status:'queued',result:null,error:'',queryResult:null,queryPending:false}));
      documents = [...documents,...added]; selectedId ||= added[0]?.id || null; notify(); run();
    },
    select(id) { if(documents.some(d=>d.id===id)) {selectedId=id;notify();} },
    remove(id) {
      const doc = documents.find(d=>d.id===id); if(!doc)return;
      jobs.get(id)?.abort(); queries.get(id)?.abort(); queries.delete(id); release(doc);
      documents = documents.filter(d=>d.id!==id); if(selectedId===id)selectedId=documents[0]?.id || null; notify();
    },
    cancel(id) { jobs.get(id)?.abort(); if(documents.some(d=>d.id===id))patch(id,{status:'cancelled'}); },
    retry(id) { const d=documents.find(d=>d.id===id); if(d && ['error','cancelled'].includes(d.status) && !jobs.has(id)) {patch(id,{status:'queued',error:''});run();} },
    updateField(id,index,value) {
      const doc=documents.find(d=>d.id===id); if(!Array.isArray(doc?.result?.fields))return;
      const fields=doc.result.fields.map((field,i)=>{if(i!==index)return field;const pageField=['filled','blank','illegible'].includes(field.state),next=pageField&&value===''?null:value;return {...field,original_value:Object.hasOwn(field,'original_value')?field.original_value:field.value,value:next,...(pageField?{state:next===null?'blank':'filled'}:{}),edited:true,reviewed:true};});
      patch(id,{result:{...doc.result,fields}});
    },
    cancelQuery(id) {queries.get(id)?.abort();queries.delete(id);if(documents.some(d=>d.id===id))patch(id,{queryPending:false});},
    async query(id,question,mode='fields') {
      const doc=documents.find(d=>d.id===id);
      if(!doc || doc.status!=='complete' || !question.trim() || disposed)return;
      if(!adapter.query){patch(id,{error:'Configure a query adapter to ask questions.'});return;}
      queries.get(id)?.abort(); const abort=new AbortController();queries.set(id,abort);patch(id,{queryPending:true,error:''});
      try {
        const result=await adapter.query({file:doc.file,result:doc.result,question,mode,signal:abort.signal});
        if(!disposed && !abort.signal.aborted)patch(id,{queryResult:result});
      } catch(failure) {if(!disposed && !abort.signal.aborted)patch(id,{error:failure?.message || 'Query failed.'});}
      finally {if(queries.get(id)===abort){queries.delete(id);if(!disposed)patch(id,{queryPending:false});}}
    },
    exportJSON(id) { const d=documents.find(d=>d.id===id);return d?.result ? JSON.stringify({name:d.name,extraction:d.result,query:d.queryResult},null,2) : null; },
    dispose() { disposed=true;for(const controller of [...jobs.values(),...queries.values()])controller.abort();documents.forEach(release);documents=[];listeners.clear(); }
  };
}

/** Download only on a user gesture. Files and results remain in the host application. */
export function downloadJSON(json,filename='pagesignal.json') {
  if(json==null)return;
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
