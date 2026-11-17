const $=id=>document.getElementById(id);
const jobs=[];
const uploadLimits={files:10,fileBytes:30*1024*1024,batchBytes:100*1024*1024,pdfPages:40,imageDataChars:3800000};
const isSupportedFile=name=>/\.(pdf|png|jpe?g|webp|bmp)$/i.test(name);
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
const fieldKey=label=>label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'field';
function reviewedValues(job){
 const fields=Object.create(null), evidence=Object.create(null);
 const add=(label,value,source)=>{
   const stem=fieldKey(label);
   let key=stem;
   for(let n=2;Object.hasOwn(fields,key);n++)key=stem+'_'+n;
   fields[key]=value??null;
   evidence[key]=source||{status:value==null?'not_found':'needs_review'};
 };
 if(job.ai&&job.aiPages.some(page=>!page.error)){
   for(const page of job.aiPages)for(const field of page.fields||[]){
     const value=field.state==='checked'?true:field.state==='unchecked'?false:field.value;
     add([field.section,field.label].filter(Boolean).join(' '),value,
       {page:page.page,excerpt:field.evidence||null,reviewed:Boolean(field.reviewed),status:field.state});
   }
 }else for(const [key,field] of Object.entries(job.fields)){
   add(key,field.value,field.page?{page:field.page,excerpt:null}:field.reviewed?{reviewed:true}:null);
 }
 for(const field of Object.values(job.requestedFields||{})){
   fields[fieldKey(field.label)]=field.value;
   evidence[fieldKey(field.label)]=field.source?{...field.source,reviewed:Boolean(field.reviewed)}:
     {status:field.value==null?'not_found':'needs_review',reviewed:Boolean(field.reviewed)};
 }
 return {fields,evidence};
}
function output(job){
 if(job.ai) return {
   schema_version:'3.0',
   ...reviewedValues(job),
   source:{file_name:job.name,page_count:job.pages,ocr_pages:job.ocrPages},
   processing_status:job.aiPages.some(page=>page.error||page.classification_status!=='identified')?'needs_review':'processed',
   pages:job.aiPages,
   ...documentIdentity(job),
   local_classification:job.classification,
   local_fields:job.fields,
   raw_text:job.text
 };
 return {
   schema_version:'3.0',
   ...reviewedValues(job),
   source:{file_name:job.name,page_count:job.pages,ocr_pages:job.ocrPages},
   document_type:job.classification.type,
   classification_basis:job.classification.basis,
   form_number:job.classification.form||null,
   document_title:job.classification.title||formNumbers[job.classification.form]||null,
   acord_form_number:job.classification.type==='acord_form'?job.classification.form||null:null,
   acord_form_title:formNumbers[job.classification.form]||null,
   local_fields:job.fields,
   raw_text:job.text
 };
}
function updateCardProgress(job){
 const card=$('jobs').querySelector('[data-job="'+job.id+'"]');
 const stage=card?.querySelector('.job-stage');
 if(!stage)return;
 const fraction=job.fraction;
 stage.textContent=job.phase||'Preparing document';
 card.querySelector('.job-percent').textContent=Number.isFinite(fraction)?Math.round(fraction*100)+'% OCR':'';
 const meter=card.querySelector('.job-meter');
 if(Number.isFinite(fraction))meter.value=fraction;
 else meter.removeAttribute('value');
}
function renderQueue(){
 $('count').textContent=jobs.length;
 $('jobs').innerHTML=jobs.length?jobs.map(job=>{
   const active=job.status==='Processing';
   const statusMarkup=active
     ? '<small class="job-stage-row"><span class="job-dot" aria-hidden="true"></span><span class="job-stage"></span><span class="job-percent"></span></small><progress class="job-meter" max="1" aria-hidden="true"></progress>'
     : '<small>'+escapeHtml(job.status)+'</small>';
   return '<button class="job'+(active?' job-active':'')+'" data-job="'+job.id+'" aria-current="'+(selected===job.id)+'">'+escapeHtml(job.name)+statusMarkup+'</button>';
 }).join(''):'<p>Uploaded files will appear here.</p>';
 for(const job of jobs)if(job.status==='Processing')updateCardProgress(job);
}
const aiCandidates=()=>jobs.filter(job=>job.valid&&!job.ai&&!job.requestAI&&job.status!=='Failed');
function sourceButtons(sources){
 return (sources||[]).map(source=>'<div class="review-evidence"><button type="button" data-source-page="'+source.page+'">Page '+source.page+'</button> '+escapeHtml(source.excerpt)+'</div>').join('');
}
function renderDocumentTools(job){
 const fields=Object.entries(job.requestedFields||{}).map(([key,field])=>
   '<div class="requested-field"><label>'+escapeHtml(field.label)+'<input data-request-key="'+escapeHtml(key)+'" value="'+escapeHtml(field.value)+'" placeholder="Not found"></label>'+sourceButtons(field.source?[field.source]:[])+'</div>').join('');
 const chat=(job.chat||[]).map((turn,index)=>
   '<div class="document-turn"><strong>'+escapeHtml(turn.question)+'</strong><p>'+escapeHtml(turn.answer)+'</p>'+sourceButtons(turn.citations)+
   (turn.citations?.length&&!turn.added?'<button type="button" data-add-answer="'+index+'">Add to fields</button>':'')+'</div>').join('');
 return '<section class="document-tools"><h3>Ask this document</h3><form id="document-question"><label for="question-text">Question or fields to find</label><textarea id="question-text" rows="2" maxlength="2000" placeholder="For example, renewal date, notice period, and termination fee">'+escapeHtml(job.questionDraft||'')+'</textarea><div class="review-actions"><button type="submit" value="fields" '+(job.asking||$('ai').disabled?'disabled':'')+'>Find specific fields</button><button type="submit" value="chat" class="primary" '+(job.asking||$('ai').disabled?'disabled':'')+'>Ask</button></div></form>'+
   (job.asking?'<p role="status">Searching this document…</p>':'')+(job.queryError?'<p class="warn" role="alert">'+escapeHtml(job.queryError)+'</p>':'')+
   (fields?'<h4>Requested fields</h4>'+fields:'')+(chat?'<h4>Conversation</h4><div class="document-chat">'+chat+'</div>':'')+'</section>';
}
function render(){
 const candidates=aiCandidates(), identify=$('analyze-ai');
 identify.hidden=$('ai').disabled||candidates.length===0;
 identify.textContent=candidates.length>1?'Identify '+candidates.length+' files with AI':'Extract all fields';
 renderQueue();
 const job=jobs.find(j=>j.id===selected);
 $('download').disabled=!job||job.status!=='Complete';
 $('subtitle').textContent=job?.name||'Select a document to inspect its results.';
 const area=$('result');
 if(!job){area.innerHTML='<div class="empty"><div class="glyph">{ }</div><h2>No document selected</h2><p>Upload a file or try the sample scans.</p></div>';return;}
 if(job.status!=='Complete'){
   area.innerHTML=job.status==='Failed'?'<div class="empty"><h2>Could not process this file</h2><p>'+escapeHtml(job.error)+'</p>'+(job.valid?'<button id="retry">Retry</button>':'')+'</div>':'<div class="empty"><h2>'+escapeHtml(job.status)+'</h2><p id="phase">'+escapeHtml(job.phase||'Waiting for processing')+'</p><progress id="progress" max="1"></progress></div>';
   return;
 }
 const c=job.classification;
 area.innerHTML='<div class="document-workspace"><section class="document-preview" aria-label="Source preview"><h3>Document preview</h3><div id="document-source"></div></section><section class="document-results">'+renderDocumentTools(job)+'<div class="tabs" role="tablist" aria-label="Review views">'+(job.ai?['AI review','Fields','Raw text','JSON']:['Fields','Raw text','JSON']).map(name=>'<button role="tab" data-tab="'+name+'" aria-selected="'+(tab===name)+'">'+name+'</button>').join('')+'</div><div id="tabBody"></div></section></div>';
 const preview=document.createElement(job.pdf?'iframe':'img');
 if(job.pdf){preview.title='Original PDF';preview.src=job.url+'#page='+(job.previewPage||1);}
 else{preview.alt='Original document';preview.src=job.url;}
 $('document-source').append(preview);
 const body=$('tabBody');
 if(tab==='AI review'){
   body.innerHTML=job.aiPages.map(page=>{
     const heading='<h3>Page '+page.page+' · '+escapeHtml(page.document_title||page.document_type?.replaceAll('_',' ')||'Needs review')+'</h3>';
     if(page.error)return '<details open class="ai-page"><summary>'+heading+'</summary><p class="warn">'+escapeHtml(page.error)+'</p></details>';
     const metadata=[page.issuer,page.classification_status==='identified'?'Identified':'Needs review',page.form_number&&'Form '+page.form_number,page.form_revision&&'Edition '+page.form_revision,page.page_role].filter(Boolean).map(escapeHtml).join(' · ');
     const fields=page.fields.map((field,i)=>'<label>'+escapeHtml([field.section,field.label].filter(Boolean).join(' / '))+'<input data-ai-page="'+page.page+'" data-ai-field="'+i+'" value="'+escapeHtml(field.value)+'" placeholder="'+escapeHtml(field.state)+'"><small>'+escapeHtml(field.state)+'</small></label>'+sourceButtons(field.evidence?[{page:page.page,excerpt:field.evidence}]:[])).join('');
     const tables=page.tables.map(table=>'<h4>'+escapeHtml(table.title||'Table')+'</h4><div class="table-scroll"><table><thead><tr>'+table.columns.map(column=>'<th>'+escapeHtml(column)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHtml(cell??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');
     return '<details open class="ai-page"><summary>'+heading+'</summary><p class="meta">'+metadata+'</p>'+((page.classification_evidence||[]).length?'<p class="meta">Evidence · '+page.classification_evidence.map(escapeHtml).join(' · ')+'</p>':'')+'<div class="fields">'+fields+'</div>'+tables+page.review_notes.map(note=>'<p class="warn">'+escapeHtml(note)+'</p>').join('')+'</details>';
   }).join('');
   return;
 }
 if(tab==='JSON'){body.innerHTML='<pre class="code"></pre>';body.firstChild.textContent=JSON.stringify(output(job),null,2);return;}
 if(tab==='Raw text'){body.innerHTML='<pre class="code"></pre>';body.firstChild.textContent=job.text||'No readable text found.';return;}
 const captured=Object.values(job.fields).filter(f=>f.value!==null).length;
 body.innerHTML='<div class="toolbar"><label for="kind">Document type</label><select id="kind">'+Object.entries(typeLabels).map(([k,v])=>'<option value="'+k+'" '+(c.type===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+(c.type==='acord_form'?'<label for="formNo">ACORD #</label><input id="formNo" inputmode="numeric" maxlength="4" size="5" value="'+escapeHtml(c.form)+'">':'')+'<span class="tag">'+(job.ocrPages.length?'OCR used':'PDF text layer')+'</span></div><p class="meta">'+escapeHtml([c.form&&'Form '+c.form,c.title||formNumbers[c.form]||c.basis].filter(Boolean).join(' · '))+' · <span id="captured">'+captured+'</span> of '+Object.keys(job.fields).length+' fields filled</p><p class="warn">Compare extracted values with the source before export. Missing fields export as null.</p><div class="fields">'+Object.entries(job.fields).map(([k,f])=>'<label>'+escapeHtml(k.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase()))+'<input data-field="'+k+'" value="'+escapeHtml(f.value)+'" placeholder="No value extracted"><small id="origin-'+k+'">'+(f.page?'Page '+f.page:f.reviewed?'Edited':'')+'</small></label>').join('')+'</div>';
}
function status(job,phase,progress){
 job.phase=phase;
 job.fraction=progress;
 updateCardProgress(job);
 if(selected!==job.id)return;
 if($('phase'))$('phase').textContent=phase;
 const meter=$('progress');
 if(meter){if(progress===undefined)meter.removeAttribute('value');else meter.value=progress;}
}
let activeOCR=null;
let ocrTail=Promise.resolve();
function recognize(job,image,page){
 const task=ocrTail.then(()=>readWithOCR(job,image,page));
 ocrTail=task.catch(()=>{});
 return task;
}
async function readWithOCR(job,image,page){
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
   let image=canvas.toDataURL('image/jpeg',.85);
   if(image.length>uploadLimits.imageDataChars)image=canvas.toDataURL('image/jpeg',.65);
   if(image.length>uploadLimits.imageDataChars)throw new Error('This page image is too large for AI extraction.');
   const response=await fetch('/api/ai/extract',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({image,text:text.slice(0,20000)})
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
   if(pdf.numPages>uploadLimits.pdfPages)throw new Error('This file has more than 40 pages. Split it into smaller PDFs and upload again.');
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
 async function processNext(){
   let job;
   while((job=jobs.find(item=>item.status==='Queued'))){
     job.status='Processing';job.phase='Preparing document';job.fraction=undefined;job.ocrPages=[];job.aiPages=[];render();
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
       if(job.requestAI){job.requestAI=false;job.ai=true;job.status='Queued';}
       if(job.ai&&selected===job.id)tab='AI review';
     }catch(error){job.status='Failed';job.error=error?.message||'OCR could not read the document.';}
     render();
   }
 }
 try{await Promise.all(Array.from({length:3},()=>processNext()));}
 finally{running=false;}
}
function enqueue(files){
 const batch=Array.from(files);
 if(!batch.length)return;
 const notice=$('upload-notice');
 if(batch.length>uploadLimits.files){
   notice.textContent='Choose up to 10 files at a time. No files from this batch were queued.';
   return;
 }
 if(batch.reduce((total,file)=>total+file.size,0)>uploadLimits.batchBytes){
   notice.textContent='This batch exceeds 100 MiB. Split it into smaller batches.';
   return;
 }
 const added=batch.map(file=>{
   let error='';
   if(!isSupportedFile(file.name))error='Unsupported format. Choose PDF, PNG, JPG, WEBP, or BMP.';
   else if(!file.size)error='This file is empty.';
   else if(file.size>uploadLimits.fileBytes)error='This file exceeds the 30 MiB limit.';
   const valid=!error;
   return {ai:$('ai').checked,id:crypto.randomUUID(),name:file.name,file,url:valid?URL.createObjectURL(file):'',pdf:/\.pdf$/i.test(file.name),status:valid?'Queued':'Failed',error,valid};
 });
 jobs.push(...added);
 const count=added.filter(job=>job.valid).length;
 notice.textContent=count+' of '+added.length+' files queued.'+(count<added.length?' Select a failed file for details.':'');
 selected=(added.find(job=>job.valid)||added[0]).id;
 tab='Fields';
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
const isFileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
window.addEventListener('dragover',event=>{if(isFileDrag(event))event.preventDefault();});
window.addEventListener('drop',event=>{if(isFileDrag(event))event.preventDefault();});
drop.addEventListener('dragover',event=>{
 if(!isFileDrag(event))return;
 event.preventDefault();event.dataTransfer.dropEffect='copy';drop.classList.add('drag');
});
drop.addEventListener('dragleave',event=>{
 if(!drop.contains(event.relatedTarget))drop.classList.remove('drag');
});
drop.addEventListener('drop',event=>{
 if(!isFileDrag(event))return;
 event.preventDefault();drop.classList.remove('drag');enqueue(event.dataTransfer.files);
});
$('sample').addEventListener('click',sample);
$('jobs').addEventListener('click',e=>{const b=e.target.closest('[data-job]');if(b){selected=b.dataset.job;tab=jobs.find(j=>j.id===selected)?.ai?'AI review':'Fields';render();}});
async function askDocument(job,mode,question){
 const pages=job.pdf?job.text.split(/^--- Page (\d+) ---\s*$/m).slice(1).reduce((result,value,i,parts)=>{
   if(i%2===0)result.push({page:Number(value),text:parts[i+1]||''});
   return result;
 },[]):[{page:1,text:job.text}];
 const context=(job.chat||[]).slice(-4).map(turn=>'Question: '+turn.question+'\nAnswer: '+turn.answer).join('\n').slice(-6000);
 job.asking=true;job.queryError='';render();
 try{
   const response=await fetch('/api/ai/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'document_query',mode,question,pages,context})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'The document question failed.');
   if(mode==='fields'){
     job.requestedFields||=Object.create(null);
     for(const field of data.fields){
       const key=fieldKey(field.label);
       if(!job.requestedFields[key]?.reviewed)job.requestedFields[key]=field;
     }
   }else{job.chat||=[];job.chat.push({question,answer:data.answer,citations:data.citations});}
   job.questionDraft='';
 }catch(error){job.queryError=error.message;}
 finally{job.asking=false;if(selected===job.id)render();}
}
$('result').addEventListener('submit',e=>{
 if(e.target.id!=='document-question')return;
 e.preventDefault();
 const job=jobs.find(item=>item.id===selected);
 const question=$('question-text').value.trim();
 const mode=e.submitter?.value||'chat';
 if(!job||job.asking||!question||$('ai').disabled)return;
 if(!job.sharedText&&!window.confirm('Send the extracted text from this document to OpenAI to answer your questions?'))return;
 job.sharedText=true;void askDocument(job,mode,question);
});
$('result').addEventListener('click',e=>{
 const sourceButton=e.target.closest('[data-source-page]');
 const addButton=e.target.closest('[data-add-answer]');
 if(sourceButton||addButton){
   const job=jobs.find(item=>item.id===selected);
   if(sourceButton){
     job.previewPage=Number(sourceButton.dataset.sourcePage);
     const frame=$('document-source').querySelector('iframe');
     if(frame)frame.src=job.url+'#page='+job.previewPage;
     $('document-source').scrollIntoView({block:'nearest'});
   }else{
     const turn=job.chat[Number(addButton.dataset.addAnswer)];
     job.requestedFields||=Object.create(null);
     const key=fieldKey(turn.question);
     if(!job.requestedFields[key]?.reviewed)job.requestedFields[key]={label:turn.question,value:turn.answer,source:turn.citations[0]};
     turn.added=true;render();
   }
   return;
 }
 const t=e.target.closest('[data-tab]');
 if(t){tab=t.dataset.tab;render();$('result').querySelector('[aria-selected=true]').focus();}
 if(e.target.id==='retry'){const job=jobs.find(j=>j.id===selected);if(job.valid){job.status='Queued';render();void run();}}
});
$('result').addEventListener('input',e=>{
 if(e.target.id==='question-text'||e.target.dataset.requestKey){
   const job=jobs.find(item=>item.id===selected);
   if(e.target.id==='question-text')job.questionDraft=e.target.value;
   else{
     const field=job.requestedFields[e.target.dataset.requestKey];
     field.value=e.target.value.trim()||null;
     field.reviewed=true;
   }
   return;
 }
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
$('analyze-ai').addEventListener('click',()=>{
 const candidates=aiCandidates();
 if(!candidates.length)return;
 const subject=candidates.length===1?'this document':candidates.length+' documents';
 if(!window.confirm('Send page images and OCR text from '+subject+' to OpenAI for identification and extraction?'))return;
 for(const job of candidates){
   if(job.status==='Processing')job.requestAI=true;
   else{job.ai=true;job.status='Queued';}
 }
 render();void run();
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
