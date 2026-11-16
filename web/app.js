const $=id=>document.getElementById(id);
const jobs=[];
let selected=null, tab='Fields', running=false, worker=null, pdfModule=null;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
function documentIdentity(job){
 const matches=job.aiPages.filter(page=>page.document_type&&page.document_type!=='unknown'&&page.classification_status!=='unidentified');
 const starts=matches.filter(page=>page.page_role!=='continuation');
 const types=new Set(starts.map(page=>page.document_type+':'+(page.form_number||'')));
 if(types.size>1)return {document_type:'mixed_documents',document_title:null,form_number:null};
 const best=starts.find(page=>page.classification_status==='identified')||starts[0]||matches[0];
 return {document_type:best?.document_type||job.classification.type,
   document_title:best?.document_title||job.classification.title||null,
   form_number:best?best.form_number:job.classification.form||null,
   classification_status:best?.classification_status||'needs_review'};
}
function output(job){
 if(job.ai) return {
   schema_version:'2.0',
   source:{file_name:job.name,page_count:job.pages,ocr_pages:job.ocrPages},
   processing_status:job.aiPages.some(page=>page.error||page.classification_status!=='identified')?'needs_review':'processed',
   pages:job.aiPages,
   ...documentIdentity(job),
   local_classification:job.classification,
   local_fields:job.fields,
   raw_text:job.text
 };
 return {
   schema_version:'1.0',
   source:{file_name:job.name,page_count:job.pages,ocr_pages:job.ocrPages},
   document_type:job.classification.type,
   classification_basis:job.classification.basis,
   form_number:job.classification.form||null,
   document_title:job.classification.title||formNumbers[job.classification.form]||null,
   acord_form_number:job.classification.type==='acord_form'?job.classification.form||null:null,
   acord_form_title:formNumbers[job.classification.form]||null,
   fields:job.fields,
   raw_text:job.text
 };
}
function renderQueue(){
 $('count').textContent=jobs.length;
 $('jobs').innerHTML=jobs.length?jobs.map(j=>'<button class="job" data-job="'+j.id+'" aria-current="'+(selected===j.id)+'">'+escapeHtml(j.name)+'<small>'+escapeHtml(j.status)+'</small></button>').join(''):'<p>Uploaded files will appear here.</p>';
}
function render(){
 renderQueue();
 const job=jobs.find(j=>j.id===selected);
 $('download').disabled=!job||job.status!=='Complete';
 $('subtitle').textContent=job?.name||'Select a document to inspect its results.';
 const area=$('result');
 if(!job){area.innerHTML='<div class="empty"><div class="glyph">{ }</div><h2>No document selected</h2><p>Upload a file or try the sample scans.</p></div>';return;}
 if(job.status!=='Complete'){
   area.innerHTML=job.status==='Failed'?'<div class="empty"><h2>Could not process this file</h2><p>'+escapeHtml(job.error)+'</p><button id="retry">Retry</button></div>':'<div class="empty"><h2>'+escapeHtml(job.status)+'</h2><p id="phase">'+escapeHtml(job.phase||'Waiting for processing')+'</p><progress id="progress" max="1"></progress></div>';
   return;
 }
 const c=job.classification;
 const analyzeButton=!job.ai&&!$('ai').disabled?'<button id="analyze-ai">Identify with AI</button> ':'';
 area.innerHTML=analyzeButton+'<div class="tabs" role="tablist" aria-label="Review views">'+(job.ai?['AI review','Fields','Source','Raw text','JSON']:['Fields','Source','Raw text','JSON']).map(name=>'<button role="tab" data-tab="'+name+'" aria-selected="'+(tab===name)+'">'+name+'</button>').join('')+'</div><div id="tabBody"></div>';
 const body=$('tabBody');
 if(tab==='AI review'){
   body.innerHTML=job.aiPages.map(page=>{
     const heading='<h3>Page '+page.page+' · '+escapeHtml(page.document_title||page.document_type?.replaceAll('_',' ')||'Needs review')+'</h3>';
     if(page.error)return '<details open class="ai-page"><summary>'+heading+'</summary><p class="warn">'+escapeHtml(page.error)+'</p></details>';
     const metadata=[page.issuer,page.classification_status==='identified'?'Identified':'Needs review',page.form_number&&'Form '+page.form_number,page.form_revision&&'Edition '+page.form_revision,page.page_role].filter(Boolean).map(escapeHtml).join(' · ');
     const fields=page.fields.map((field,i)=>'<label>'+escapeHtml([field.section,field.label].filter(Boolean).join(' / '))+'<input data-ai-page="'+page.page+'" data-ai-field="'+i+'" value="'+escapeHtml(field.value)+'" placeholder="'+escapeHtml(field.state)+'"><small>'+escapeHtml(field.state+(field.evidence?' · '+field.evidence:''))+'</small></label>').join('');
     const tables=page.tables.map(table=>'<h4>'+escapeHtml(table.title||'Table')+'</h4><div class="table-scroll"><table><thead><tr>'+table.columns.map(column=>'<th>'+escapeHtml(column)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHtml(cell??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');
     return '<details open class="ai-page"><summary>'+heading+'</summary><p class="meta">'+metadata+'</p>'+((page.classification_evidence||[]).length?'<p class="meta">Evidence · '+page.classification_evidence.map(escapeHtml).join(' · ')+'</p>':'')+'<div class="fields">'+fields+'</div>'+tables+page.review_notes.map(note=>'<p class="warn">'+escapeHtml(note)+'</p>').join('')+'</details>';
   }).join('');
   return;
 }
 if(tab==='JSON'){body.innerHTML='<pre class="code"></pre>';body.firstChild.textContent=JSON.stringify(output(job),null,2);return;}
 if(tab==='Raw text'){body.innerHTML='<pre class="code"></pre>';body.firstChild.textContent=job.text||'No readable text found.';return;}
 if(tab==='Source'){
   const source=document.createElement(job.pdf?'iframe':'img');
   source.className='preview';
   source.src=job.url;
   if(job.pdf)source.title='Original PDF';else source.alt='Original document';
   body.append(source);return;
 }
 const captured=Object.values(job.fields).filter(f=>f.value!==null).length;
 body.innerHTML='<div class="toolbar"><label for="kind">Document type</label><select id="kind">'+Object.entries(typeLabels).map(([k,v])=>'<option value="'+k+'" '+(c.type===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+(c.type==='acord_form'?'<label for="formNo">ACORD #</label><input id="formNo" inputmode="numeric" maxlength="4" size="5" value="'+escapeHtml(c.form)+'">':'')+'<span class="tag">'+(job.ocrPages.length?'OCR used':'PDF text layer')+'</span></div><p class="meta">'+escapeHtml([c.form&&'Form '+c.form,c.title||formNumbers[c.form]||c.basis].filter(Boolean).join(' · '))+' · <span id="captured">'+captured+'</span> of '+Object.keys(job.fields).length+' fields filled</p><p class="warn">Compare extracted values with the source before export. Missing fields export as null.</p><div class="fields">'+Object.entries(job.fields).map(([k,f])=>'<label>'+escapeHtml(k.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase()))+'<input data-field="'+k+'" value="'+escapeHtml(f.value)+'" placeholder="No value extracted"><small id="origin-'+k+'">'+(f.page?'Page '+f.page:f.reviewed?'Edited':'')+'</small></label>').join('')+'</div>';
}
function status(job,phase,progress){
 job.phase=phase;
 if(selected!==job.id)return;
 if($('phase'))$('phase').textContent=phase;
 const meter=$('progress');
 if(meter){if(progress===undefined)meter.removeAttribute('value');else meter.value=progress;}
}
let activeOCR=null;
async function recognize(job,image,page){
 activeOCR={job,page};
 if(!worker){
   if(!window.Tesseract)throw new Error('The OCR library could not load. Check your internet connection and retry.');
   status(job,'Loading English OCR model');
   worker=await Tesseract.createWorker('eng',1,{logger(message){
     if(activeOCR&&message.status==='recognizing text')status(activeOCR.job,'Reading page '+activeOCR.page,message.progress);
   }});
 }
 status(job,'Reading page '+page);
 try{return (await worker.recognize(image)).data.text;}
 catch(error){await worker.terminate().catch(()=>{});worker=null;throw error;}
 finally{activeOCR=null;}
}
function pdfLines(items){
 const lines=[];
 for(const item of items){
   if(typeof item.str!=='string')continue;
   const y=item.transform[5],x=item.transform[4];
   let row=lines.find(entry=>Math.abs(entry.y-y)<3);
   if(!row){row={y,items:[]};lines.push(row);}
   row.items.push({x,text:item.str});
 }
 return lines.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ').trim()).filter(Boolean).join('\n');
}
async function extractWithAI(job,page,canvas,text){
 status(job,'Analyzing layout and fields on page '+page);
 try{
   const response=await fetch('/api/ai/extract',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({image:canvas.toDataURL('image/jpeg',.85),text:text.slice(0,20000)})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'AI could not extract this page.');
   const printed=identifyPrintedForm(text);
   if(printed?.type==='uscis_form'&&(!result.form_number||/^[I1l]\s*[-–—]\s*539$/i.test(result.form_number))){
     result.form_number=printed.form;
     if(!result.document_type||result.document_type==='unknown')result.document_type=printed.type;
     result.document_title||=printed.title;
   }
   job.aiPages.push({page,...result});
 }catch(error){job.aiPages.push({page,error:error.message});}
}
async function readPdf(job){
 if(!pdfModule){
   pdfModule=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
   pdfModule.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
 }
 const documentTask=pdfModule.getDocument({data:new Uint8Array(await job.file.arrayBuffer()),isEvalSupported:false});
 const pages=[];
 try{
   const pdf=await documentTask.promise;
   job.pages=pdf.numPages;
   if(pdf.numPages>40)throw new Error('This file has more than 40 pages. Split it into smaller PDFs and upload again.');
   for(let n=1;n<=pdf.numPages;n++){
     status(job,'Checking page '+n+' of '+pdf.numPages);
     const page=await pdf.getPage(n);
     let text=pdfLines((await page.getTextContent()).items);
     const needsOcr=text.replace(/\s/g,'').length<45||classify(text).type==='other';
     if(needsOcr||job.ai){
       const base=page.getViewport({scale:1});
       const viewport=page.getViewport({scale:Math.min(3,2300/Math.max(base.width,base.height))});
       const canvas=document.createElement('canvas');
       canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
       await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
       if(needsOcr){
         try{const scanned=await recognize(job,canvas,n);if(scanned.trim())text=text.trim()?text+'\n'+scanned:scanned;job.ocrPages.push(n);}
         catch(error){if(!text.trim()&&!job.ai)throw error;}
       }
       if(job.ai)await extractWithAI(job,n,canvas,text);
       canvas.width=0;canvas.height=0;
     }
     pages.push('--- Page '+n+' ---\n'+text.trim());
     page.cleanup();
   }
   return pages.join('\n\n');
 }finally{await documentTask.destroy();}
}
async function run(){
 if(running)return;
 running=true;
 try{
   for(const job of jobs){
     if(job.status!=='Queued')continue;
     job.status='Processing';job.ocrPages=[];job.aiPages=[];render();
     try{
       if(job.pdf){job.text=await readPdf(job);}
       else{
         job.pages=1;job.text=(await recognize(job,job.file,1)).trim();job.ocrPages=[1];
         if(job.ai){
           const bitmap=await createImageBitmap(job.file);
           const scale=Math.min(1,2300/Math.max(bitmap.width,bitmap.height));
           const canvas=document.createElement('canvas');
           canvas.width=Math.max(1,Math.round(bitmap.width*scale));
           canvas.height=Math.max(1,Math.round(bitmap.height*scale));
           const context=canvas.getContext('2d');
           context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
           context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
           await extractWithAI(job,1,canvas,job.text);
         }
       }
       job.classification=classify(job.text);
       job.fields=extractFields(job.text,job.classification);
       job.status='Complete';
       if(job.ai&&selected===job.id)tab='AI review';
     }catch(error){job.status='Failed';job.error=error?.message||'OCR could not read the document.';}
     render();
   }
 }finally{running=false;}
}
function enqueue(files){
 const added=Array.from(files).map(file=>{
   const valid=/\.(pdf|png|jpe?g|webp|bmp)$/i.test(file.name)&&file.size>0&&file.size<=30*1024*1024;
   return {ai:$('ai').checked,id:crypto.randomUUID(),name:file.name,file,url:valid?URL.createObjectURL(file):'',pdf:/\.pdf$/i.test(file.name),status:valid?'Queued':'Failed',error:valid?'':'Choose a supported file up to 30 MB.',valid};
 });
 jobs.push(...added);
 if(added.length){selected=added[0].id;tab='Fields';}
 render();void run();
}
async function sample(){
 const examples=[
  ['acord-125-sample.png',['ACORD 125','COMMERCIAL INSURANCE APPLICATION','Named Insured: Harbor Ridge Fabrication LLC','Agency: Summit Risk Partners','Proposed Effective Date: 12/01/2026','Proposed Expiration Date: 12/01/2027','Mailing Address: 105 Main Street, St. Louis, MO','NAICS Code: 332312','Annual Revenue: $4,250,000','Nature of Business: Steel fabrication']],
  ['invoice-sample.png',['INVOICE','Vendor: Harbor Office Supply','Invoice Number: INV-10482','Invoice Date: 11/12/2026','Due Date: 12/12/2026','Bill To: Redwood Consulting LLC','Subtotal: $650.00','Sales Tax: $52.00','Grand Total: $702.00','Currency: USD']]
 ];
 const files=await Promise.all(examples.map(([name,rows])=>new Promise(resolve=>{
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=740;
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,740);
   ctx.fillStyle='#111';rows.forEach((row,i)=>{ctx.font=i?'32px Arial':'bold 50px Arial';ctx.fillText(row,60,78+i*60);});
   canvas.toBlob(blob=>resolve(new File([blob],name,{type:'image/png'})),'image/png');
 })));
 enqueue(files);
}
$('file').addEventListener('change',e=>{enqueue(e.target.files);e.target.value='';});
const drop=$('drop');
for(const name of ['dragover','dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.toggle('drag',name==='dragover');if(name==='drop')enqueue(e.dataTransfer.files);});
$('sample').addEventListener('click',sample);
$('jobs').addEventListener('click',e=>{const b=e.target.closest('[data-job]');if(b){selected=b.dataset.job;tab=jobs.find(j=>j.id===selected)?.ai?'AI review':'Fields';render();}});
$('result').addEventListener('click',e=>{
 const t=e.target.closest('[data-tab]');
 if(t){tab=t.dataset.tab;render();$('result').querySelector('[aria-selected=true]').focus();}
 if(e.target.id==='analyze-ai'){
   const job=jobs.find(j=>j.id===selected);
   if(window.confirm('Send this document’s page images and OCR text to OpenAI for identification and extraction?')){
     job.ai=true;job.status='Queued';render();void run();
   }
 }
 if(e.target.id==='retry'){const job=jobs.find(j=>j.id===selected);if(job.valid){job.status='Queued';render();void run();}}
});
$('result').addEventListener('input',e=>{
 const {aiPage,aiField}=e.target.dataset;
 if(aiPage){
   const job=jobs.find(j=>j.id===selected);
   const field=job.aiPages.find(p=>p.page===Number(aiPage)).fields[Number(aiField)];
   field.value=e.target.value.trim()||null;
   if(!['checked','unchecked'].includes(field.state))field.state=field.value===null?'blank':'filled';
   field.reviewed=true;
   return;
 }
 const key=e.target.dataset.field;
 if(!key)return;
 const job=jobs.find(j=>j.id===selected);
 job.fields[key]={value:e.target.value.trim()||null,page:null,reviewed:true};
 $('origin-'+key).textContent='Edited';
 $('captured').textContent=Object.values(job.fields).filter(f=>f.value!==null).length;
});
$('result').addEventListener('change',e=>{
 if(!['kind','formNo'].includes(e.target.id))return;
 const job=jobs.find(j=>j.id===selected);
 const type=$('kind').value;
 const form=type==='acord_form'?($('formNo')?.value||'').replace(/\D/g,''):'';
 const previous=job.fields;
 job.classification={type,form,basis:'Manually selected'};
 job.fields=extractFields(job.text,job.classification);
 for(const key of Object.keys(job.fields))if(previous[key]?.reviewed)job.fields[key]=previous[key];
 render();
});
$('download').addEventListener('click',()=>{
 const job=jobs.find(j=>j.id===selected);
 const url=URL.createObjectURL(new Blob([JSON.stringify(output(job),null,2)],{type:'application/json'}));
 const link=document.createElement('a');
 link.href=url;link.download=job.name.replace(/\.[^.]+$/,'')+'.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();

fetch('/api/ai/status').then(response=>response.json()).then(({configured})=>{
 $('ai').disabled=!configured;
 render();
 $('ai-status').textContent=configured?'Optional. Sends page images and OCR text to OpenAI.':'AI setup required. Local OCR is available.';
}).catch(()=>{$('ai-status').textContent='AI availability could not be checked. Local OCR is available.';});
