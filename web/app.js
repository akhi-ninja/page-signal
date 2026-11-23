import {readingOptions,imagePlan,paintImage} from '/reading-options.mjs';
import {reconcileDocument} from '/document-contract.mjs';
import { assessScan, verifyFields, reconcilePages } from '/document-quality.mjs';
import { loadOCR } from '/ocr-loader.mjs';
import { DocumentViewer, pdfWordBoxes, ocrWordBoxes } from '/document-viewer.mjs';
const $=id=>document.getElementById(id);
const jobs=[];
const uploadLimits={files:10,fileBytes:30*1024*1024,batchBytes:100*1024*1024,pdfPages:40,imageDataChars:3800000};
const isSupportedFile=name=>/\.(pdf|png|jpe?g|webp|bmp)$/i.test(name);
let viewer=null;
const workspaceAllowed=()=>window.PageSignalAccount.state.authRequired===false||Boolean(window.PageSignalAccount.state.user);
let selected=null, tab='Fields', running=false, worker=null, workerLanguages=null, pdfModule=null;
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
     const verification=verifyFields({fields:[field]},job.pageTexts?.[page.page]||'',page.page)[0].verification;
     const value=field.state==='checked'?true:field.state==='unchecked'?false:field.value;
     add([field.section,field.label].filter(Boolean).join(' '),value,
       {page:page.page,excerpt:field.evidence||null,reviewed:Boolean(field.reviewed),status:field.state,verification});
   }
 }else for(const [key,field] of Object.entries(job.fields)){
   add(key,field.value,field.page?{page:field.page,excerpt:null}:field.reviewed?{reviewed:true}:null);
 }
 for(const field of Object.values(job.requestedFields||{})){
   add(field.label,field.value,field.source?{...field.source,reviewed:Boolean(field.reviewed)}:
     {status:field.value==null?'not_found':'needs_review',reviewed:Boolean(field.reviewed)});
 }
 return {fields,evidence};
}
function output(job){
 if(job.ai) return {
   schema_version:'3.0',
   ...reviewedValues(job),
   source:{file_name:job.name,page_count:job.pages,ocr_pages:job.ocrPages},
   processing_status:job.aiPages.some(page=>page.error||page.classification_status!=='identified'||verifyFields(page,job.pageTexts?.[page.page]||'',page.page).some(f=>['needs_review','illegible'].includes(f.verification.status)))||reconcilePages(job.aiPages).conflicts.length?'needs_review':'processed',
   pages:job.aiPages.map(p=>p.error?p:{...p,fields:verifyFields(p,job.pageTexts?.[p.page]||'',p.page)}),
   document_review:reconcilePages(job.aiPages),
   document_grouping:job.aiPages.length?reconcileDocument(job.aiPages.map(p=>p.error?{page:p.page,error:{code:'page_failed'}}:{page:p.page,result:p})):null,
   scan_quality:job.scanQuality||{},
   ...documentIdentity(job),
   local_classification:job.classification,
   local_fields:job.fields,
   reading_options:job.reading||readingOptions(),preprocessing:job.preprocessing||{},reading_status:job.readingStatus||'not_assessed',
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
   reading_options:job.reading||readingOptions(),preprocessing:job.preprocessing||{},reading_status:job.readingStatus||'not_assessed',
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
 return (sources||[]).map(source=>'<div class="review-evidence"><button type="button" data-source-page="'+source.page+'" data-source-excerpt="'+escapeHtml(source.excerpt)+'">Page '+source.page+'</button> '+escapeHtml(source.excerpt)+'</div>').join('');
}
function renderDocumentTools(job){
 const fields=Object.entries(job.requestedFields||{}).map(([key,field])=>
   '<div class="requested-field"><label>'+escapeHtml(field.label)+'<input data-request-key="'+escapeHtml(key)+'" value="'+escapeHtml(field.value)+'" placeholder="Not found"></label>'+sourceButtons(field.source?[field.source]:[])+'</div>').join('');
 const chat=(job.chat||[]).map((turn,index)=>
   '<div class="document-turn"><strong>'+escapeHtml(turn.question)+'</strong><p>'+escapeHtml(turn.answer)+'</p>'+sourceButtons(turn.citations)+
   (turn.fields?.some(field=>field.value!==null)&&!turn.added?'<button type="button" data-add-answer="'+index+'">Add to fields</button>':'')+'</div>').join('');
 return '<section class="document-tools"><h3>Ask this document</h3>'+(!job.ai?'<p class="warn">OCR-only results can miss scanned form values. Use Extract all fields / Identify with AI above to read the page images before asking about unclear values.</p>':'')+'<form id="document-question"><label for="question-text">Question or fields to find</label><textarea id="question-text" rows="2" maxlength="2000" placeholder="For example, renewal date, notice period, and termination fee">'+escapeHtml(job.questionDraft||'')+'</textarea><div class="review-actions"><button type="submit" value="fields" '+(job.asking||$('ai').disabled?'disabled':'')+'>Find specific fields</button><button type="submit" value="chat" class="primary" '+(job.asking||$('ai').disabled?'disabled':'')+'>Ask</button></div></form>'+
   (job.asking?'<p role="status">Searching this document…</p>':'')+(job.queryError?'<p class="warn" role="alert">'+escapeHtml(job.queryError)+'</p>':'')+
   (fields?'<h4>Requested fields</h4>'+fields:'')+(chat?'<h4>Conversation</h4><div class="document-chat">'+chat+'</div>':'')+'</section>';
}
function render(){
 viewer?.destroy();viewer=null;
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
 area.innerHTML='<div class="document-workspace"><section class="document-results">'+renderDocumentTools(job)+'<div class="tabs" role="tablist" aria-label="Review views">'+(job.ai?['AI review','Fields','Raw text','JSON']:['Fields','Raw text','JSON']).map(name=>'<button role="tab" data-tab="'+name+'" aria-selected="'+(tab===name)+'">'+name+'</button>').join('')+'</div><div id="tabBody"></div></section><section class="document-preview" aria-label="Source preview"><h3>Document preview</h3><div id="document-source"></div></section></div>';
 viewer=new DocumentViewer($('document-source'),job,loadPdfModule);
 const body=$('tabBody');
 if(tab==='AI review'||(tab==='Fields'&&job.ai&&job.aiPages.some(page=>!page.error))){
   body.innerHTML=reconcilePages(job.aiPages).conflicts.map(c=>'<p class="warn">Different values for '+escapeHtml([c.section,c.label].filter(Boolean).join(' / '))+' across pages '+c.sources.map(s=>s.page).join(', ')+'. Review before export.</p>').join('')+job.aiPages.map(page=>{
     const heading='<h3>Page '+page.page+' · '+escapeHtml(page.document_title||page.document_type?.replaceAll('_',' ')||'Needs review')+'</h3>';
     if(page.error)return '<details open class="ai-page"><summary>'+heading+'</summary><p class="warn">'+escapeHtml(page.error)+'</p></details>';
     const metadata=[page.issuer,page.classification_status==='identified'?'Identified':'Needs review',page.form_number&&'Form '+page.form_number,page.form_revision&&'Edition '+page.form_revision,page.page_role].filter(Boolean).map(escapeHtml).join(' · ');
     const fields=page.fields.map((field,i)=>{
       const checkbox=['checked','unchecked'].includes(field.state)||field.checkbox;
       const control=checkbox?'<select aria-label="'+escapeHtml(field.label)+'" data-checkbox-page="'+page.page+'" data-checkbox-field="'+i+'">'+['checked','unchecked','blank'].map(state=>'<option value="'+state+'" '+(field.state===state?'selected':'')+'>'+state+'</option>').join('')+'</select>':'<input data-ai-page="'+page.page+'" data-ai-field="'+i+'" value="'+escapeHtml(field.value)+'" placeholder="'+escapeHtml(field.state)+'">';
       return '<div class="quality-field"><label>'+escapeHtml([field.section,field.label].filter(Boolean).join(' / '))+control+'<small>'+escapeHtml(field.state)+' · '+escapeHtml(verifyFields({fields:[field]},job.pageTexts?.[page.page]||'',page.page)[0].verification.status.replaceAll('_',' '))+'</small></label>'+(field.state!=='blank'?'<button type="button" data-recheck-page="'+page.page+'" data-recheck-field="'+i+'" '+(job.rechecking?'disabled':'')+'>Recheck source with AI</button><small>One additional AI request; result needs your review.</small>':'')+(field.recheck?'<p class="meta">'+escapeHtml(field.recheck.message||'AI crop result — review before applying')+'</p>'+(field.recheck.proposals||[]).map((proposal,p)=>'<p>'+escapeHtml(proposal.label)+': '+escapeHtml(proposal.value??proposal.state)+' <button type="button" data-apply-recheck-page="'+page.page+'" data-apply-recheck-field="'+i+'" data-proposal="'+p+'">Use this value</button></p>').join(''):'')+sourceButtons(field.evidence?[{page:page.page,excerpt:field.evidence}]:[])+'</div>';
     }).join('');
     const tables=page.tables.map(table=>'<h4>'+escapeHtml(table.title||'Table')+'</h4><div class="table-scroll"><table><thead><tr>'+table.columns.map(column=>'<th>'+escapeHtml(column)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHtml(cell??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');
     return '<details open class="ai-page"><summary>'+heading+'</summary><p class="meta">'+metadata+'</p>'+((page.classification_evidence||[]).length?'<p class="meta">Evidence · '+page.classification_evidence.map(escapeHtml).join(' · ')+'</p>':'')+(job.scanQuality?.[page.page]?.warnings||[]).map(w=>'<p class="warn">Scan quality: '+escapeHtml(w.replaceAll('_',' '))+'. Check the original page.</p>').join('')+'<div class="fields">'+fields+'</div>'+tables+page.review_notes.map(note=>'<p class="warn">'+escapeHtml(note)+'</p>').join('')+'</details>';
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
 const languages=(job.reading||readingOptions()).languages;
 if(worker&&workerLanguages!==languages.join('+')){await worker.terminate();worker=null;}
 if(!worker){
   status(job,'Loading selected OCR languages');
   const Tesseract=await loadOCR();
   workerLanguages=languages.join('+');
   worker=await Tesseract.createWorker(languages,1,{logger(message){
     if(activeOCR&&message.status==='recognizing text')status(activeOCR.job,'Reading page '+activeOCR.page,message.progress);
   }});
 }
 status(job,'Reading page '+page);
 try{
   if(image.getContext)recordScanHints(job,page,image);
   const result=await worker.recognize(image,{}, {text:true,blocks:true});
   let width=image.width,height=image.height;
   if(!width||!height){const bitmap=await createImageBitmap(image);width=bitmap.width;height=bitmap.height;bitmap.close();}
   job.pageWords||={};job.pageWords[page]=ocrWordBoxes(result.data,width,height);
   job.ocrLanguage=languages.join('+');
   return result.data.text;
 }
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
function recordScanHints(job,page,canvas){
 const sample=document.createElement('canvas');sample.width=128;sample.height=128;
 const sampleContext=sample.getContext('2d',{willReadFrequently:true});sampleContext.drawImage(canvas,0,0,128,128);
 job.scanQuality||={};job.scanQuality[page]=assessScan({width:job.pdf?canvas.width:job.preprocessing?.[page]?.original_width||canvas.width,height:job.pdf?canvas.height:job.preprocessing?.[page]?.original_height||canvas.height,pixels:sampleContext.getImageData(0,0,128,128).data});
}
async function extractWithAI(job,page,canvas,text){
 status(job,'Analyzing layout and fields on page '+page);
 job.pageTexts||={};job.pageTexts[page]=text;
 recordScanHints(job,page,canvas);
 try{
   if(!await window.PageSignalAccount.ensureSignedIn())throw new Error('Sign in before running AI extraction.');
   let image=canvas.toDataURL('image/jpeg',.85);
   if(image.length>uploadLimits.imageDataChars)image=canvas.toDataURL('image/jpeg',.65);
   if(image.length>uploadLimits.imageDataChars)throw new Error('This page image is too large for AI extraction.');
   const response=await fetch('/api/ai/extract',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({image,text:text.slice(0,20000),words:(job.pageWords?.[page]||[]).slice(0,2000)})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'AI could not extract this page.');
   const printed=identifyPrintedForm(text);
   if(printed?.type==='uscis_form'&&(!result.form_number||/^[I1l]\s*[-–—]\s*539$/i.test(result.form_number))){
     result.form_number=printed.form;
     if(!result.document_type||result.document_type==='unknown')result.document_type=printed.type;
     result.document_title||=printed.title;
   }
   for(const crop of result.vision_recheck||[]){const matches=result.fields.filter(f=>f.label===crop.target.label&&f.section===crop.target.section);if(matches.length===1)matches[0].recheck={source:{page,box:crop.source.box},proposals:[crop.proposal],message:'Automatic crop proposal — compare with the original before applying'};}
   job.aiPages.push({page,...result});
 }catch(error){job.aiPages.push({page,error:error.message});}
}
async function loadPdfModule(){
 if(!pdfModule){
   pdfModule=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
   pdfModule.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
 }
 return pdfModule;
}
async function readPdf(job){
 await loadPdfModule();
 const documentTask=pdfModule.getDocument({data:new Uint8Array(await job.file.arrayBuffer()),isEvalSupported:false});
 const pages=[];
 try{
   const pdf=await documentTask.promise;
   job.pages=pdf.numPages;
   if(pdf.numPages>uploadLimits.pdfPages)throw new Error('This file has more than 40 pages. Split it into smaller PDFs and upload again.');
   for(let n=1;n<=pdf.numPages;n++){
     status(job,'Checking page '+n+' of '+pdf.numPages);
     const page=await pdf.getPage(n);
     if(!workspaceAllowed())throw new Error('Sign in to process documents.');
     const rotation=(page.rotate+(job.reading?.rotation||0))%360;
     const items=(await page.getTextContent()).items;
     let text=pdfLines(items);
     job.pageWords||={};job.pageWords[n]=pdfWordBoxes(items,page.getViewport({scale:1,rotation}),pdfModule.Util.transform);
     const needsOcr=text.replace(/\s/g,'').length<45||classify(text).type==='other';
     if(needsOcr||job.ai){
       const base=page.getViewport({scale:1,rotation});
       const plan=imagePlan(base.width,base.height);
       const viewport=page.getViewport({scale:plan.width/base.width,rotation});
       job.preprocessing||={};job.preprocessing[n]={...plan,rotation_degrees:rotation,pdf_rotation_degrees:page.rotate,user_rotation_degrees:job.reading?.rotation||0};
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
     job.status='Processing';job.phase='Preparing document';job.fraction=undefined;job.ocrPages=[];job.aiPages=[];job.scanQuality={};job.pageTexts={};render();
     try{
       if(!workspaceAllowed())throw new Error('Sign in to process documents.');
       if(job.pdf){job.text=await readPdf(job);}
       else{
         job.pages=1;const bitmap=await createImageBitmap(job.file),canvas=document.createElement('canvas');
         const plan=imagePlan(bitmap.width,bitmap.height,{rotation:job.reading?.rotation||0});
         paintImage(canvas,bitmap,plan);bitmap.close();job.preprocessing={1:plan};
         job.text=(await recognize(job,canvas,1)).trim();job.ocrPages=[1];
         if(job.ai)await extractWithAI(job,1,canvas,job.text);
         canvas.width=0;canvas.height=0;
       }
       job.readingStatus=job.text.trim()?'text_available':'unreadable_local_text';
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
 finally{running=false;void window.PageSignalAccount.refresh();}
}
async function enqueue(files){
 if(!await window.PageSignalAccount.ensureSignedIn())return;
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
   return {reading:readingOptions({languages:($('ocr-language')?.value||'eng').split('+'),rotation:Number($('reading-rotation')?.value||0)}),ai:$('ai').checked,id:crypto.randomUUID(),name:file.name,file,url:valid?URL.createObjectURL(file):'',pdf:/\.pdf$/i.test(file.name),status:valid?'Queued':'Failed',error,valid};
 });
 jobs.push(...added);
 const count=added.filter(job=>job.valid).length;
 notice.textContent=count+' of '+added.length+' files queued.'+(count<added.length?' Select a failed file for details.':'');
 selected=(added.find(job=>job.valid)||added[0]).id;
 tab='Fields';
 render();void run();
}
async function sample(){
 if(!await window.PageSignalAccount.ensureSignedIn())return;
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
$('file').addEventListener('click',event=>{
 if(!workspaceAllowed()){event.preventDefault();void window.PageSignalAccount.ensureSignedIn();}
});
$('file').addEventListener('change',e=>{void enqueue(Array.from(e.target.files));e.target.value='';});
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
 event.preventDefault();drop.classList.remove('drag');void enqueue(Array.from(event.dataTransfer.files));
});
$('sample').addEventListener('click',sample);
$('jobs').addEventListener('click',e=>{const b=e.target.closest('[data-job]');if(b){selected=b.dataset.job;tab=jobs.find(j=>j.id===selected)?.ai?'AI review':'Fields';render();}});
async function askDocument(job,mode,question){
 const pages=job.pdf?job.text.split(/^--- Page (\d+) ---\s*$/m).slice(1).reduce((result,value,i,parts)=>{
   if(i%2===0)result.push({page:Number(value),text:parts[i+1]||''});
   return result;
 },[]):[{page:1,text:job.text}];
 for(const page of pages){
   const aiPage=job.aiPages?.find(p=>p.page===page.page&&!p.error);
   if(aiPage)page.text=(aiPage.fields||[]).filter(f=>f.value!==null).map(f=>[f.section,f.label,f.value].filter(v=>v!==null).join(' | ')).join('\n')+'\n'+page.text;
 }
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
   }else{job.chat||=[];job.chat.push({question,answer:data.answer,citations:data.citations,fields:data.fields});}
   job.questionDraft='';
 }catch(error){job.queryError=error.message;}
 finally{job.asking=false;if(selected===job.id)render();void window.PageSignalAccount.refresh();}
}
async function recheckSource(job,page,index){
 if(job.rechecking||!viewer||viewer.job!==job)return;
 const field=job.aiPages.find(p=>p.page===page)?.fields[index];if(!field)return;
 const activeViewer=viewer;
 if(!await window.PageSignalAccount.ensureSignedIn())return;
 if(viewer!==activeViewer||selected!==job.id)return;
 job.rechecking=true;
 try{
  const crop=await activeViewer.cropSource([{text:field.evidence,kind:'evidence'},{text:field.value,kind:'value'}],page);
  if(crop.image.length>uploadLimits.imageDataChars)throw new Error('Source crop is too large. Review the original manually.');
  const response=await fetch('/api/ai/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:crop.image,text:''})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Source recheck failed.');
  field.recheck={source:crop.source,proposals:(result.fields||[]).filter(f=>f&&typeof f.label==='string').slice(0,12),message:'AI crop result — review against the original before applying'};
  if(!field.recheck.proposals.length)field.recheck.message='No field could be read from this crop. Review the original manually.';
 }catch(error){field.recheck={message:error.message,proposals:[]};}
 finally{job.rechecking=false;if(selected===job.id)render();void window.PageSignalAccount.refresh();}
}
$('result').addEventListener('submit',async e=>{
 if(e.target.id!=='document-question')return;
 e.preventDefault();
 const job=jobs.find(item=>item.id===selected);
 const question=$('question-text').value.trim();
 const mode=e.submitter?.value||'chat';
 if(!job||job.asking||!question||$('ai').disabled)return;
 if(!await window.PageSignalAccount.ensureSignedIn())return;
 if(!job.sharedText&&!window.confirm('Send the extracted text from this document to OpenAI to answer your questions?'))return;
 job.sharedText=true;void askDocument(job,mode,question);
});
$('result').addEventListener('click',e=>{
 const recheck=e.target.closest('[data-recheck-page]'),apply=e.target.closest('[data-apply-recheck-page]');
 if(recheck||apply){
  const job=jobs.find(j=>j.id===selected);if(!job)return;
  if(recheck){void recheckSource(job,Number(recheck.dataset.recheckPage),Number(recheck.dataset.recheckField));}
  else{const field=job.aiPages.find(p=>p.page===Number(apply.dataset.applyRecheckPage))?.fields[Number(apply.dataset.applyRecheckField)];const proposal=field?.recheck?.proposals[Number(apply.dataset.proposal)];if(proposal){if(!Object.hasOwn(field,'original_value'))field.original_value=field.value;field.value=proposal.value;field.state=proposal.state;field.evidence=proposal.evidence;field.reviewed=true;field.recheck.message='Applied after user review';render();}}
  return;
 }
 const sourceButton=e.target.closest('[data-source-page]');
 const addButton=e.target.closest('[data-add-answer]');
 if(sourceButton||addButton){
   const job=jobs.find(item=>item.id===selected);
   if(sourceButton){
     void viewer?.locate([{text:sourceButton.dataset.sourceExcerpt,kind:'evidence'}],Number(sourceButton.dataset.sourcePage),'Source evidence');
   }else{
     const turn=job.chat[Number(addButton.dataset.addAnswer)];
     job.requestedFields||=Object.create(null);
     for(const field of turn.fields||[]){
       if(field.value===null)continue;
       const key=fieldKey(field.label);
       if(!job.requestedFields[key]?.reviewed)job.requestedFields[key]={...field};
     }
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
     if(!Object.hasOwn(field,'original_value'))field.original_value=field.value;
   field.value=e.target.value.trim()||null;
     field.reviewed=true;
   }
   return;
 }
 const {aiPage,aiField}=e.target.dataset;
 if(aiPage){
   const job=jobs.find(j=>j.id===selected);
   const field=job.aiPages.find(p=>p.page===Number(aiPage)).fields[Number(aiField)];
   if(!Object.hasOwn(field,'original_value'))field.original_value=field.value;
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
 if(e.target.dataset.checkboxPage){
   const job=jobs.find(j=>j.id===selected);
   const field=job.aiPages.find(p=>p.page===Number(e.target.dataset.checkboxPage)).fields[Number(e.target.dataset.checkboxField)];
   if(!Object.hasOwn(field,'original_value'))field.original_value=field.value;field.checkbox=true;field.state=e.target.value;field.value=null;field.reviewed=true;
   render();return;
 }
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
$('analyze-ai').addEventListener('click',async ()=>{
 const candidates=aiCandidates();
 if(!candidates.length)return;
 if(!await window.PageSignalAccount.ensureSignedIn())return;
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

window.pageSignalHasDocuments=()=>jobs.length>0;
function updateAccountAvailability(){
 const state=window.PageSignalAccount.state;
 const allowed=workspaceAllowed();
 $('workspace-main').hidden=false;$('workspace-main').inert=false;
 if(!allowed&&!state.statusUnavailable&&jobs.length){viewer?.destroy();viewer=null;for(const job of jobs)URL.revokeObjectURL(job.url);jobs.splice(0);selected=null;}

 $('ai').disabled=!state.configured;
 if(!state.user&&state.authRequired)$('ai').checked=false;
 $('ai-status').textContent=!state.configured?'AI setup required. Sign-in is required to open the workspace.':
   state.authRequired&&!state.authConfigured?'Sign-in setup required. Uploads are locked.':
   state.authRequired&&!state.user?'Sign in to upload and process documents.':
   'Optional. Sends page images and OCR text to OpenAI.';
 render();
}
window.addEventListener('pagesignal:account',updateAccountAvailability);
window.PageSignalAccount.ready.then(updateAccountAvailability);
$('ai').addEventListener('change',async()=>{
 if($('ai').checked&&!await window.PageSignalAccount.ensureSignedIn())$('ai').checked=false;
});


function locateControl(control){
 const job=jobs.find(item=>item.id===selected);if(!job||!viewer)return;
 let field,label,page,evidence,value;
 if(control.dataset.aiPage||control.dataset.checkboxPage){page=Number(control.dataset.aiPage||control.dataset.checkboxPage);field=job.aiPages.find(p=>p.page===page)?.fields[Number(control.dataset.aiField??control.dataset.checkboxField)];label=field?.label;evidence=field?.evidence;value=field?.value;}
 else if(control.dataset.requestKey){field=job.requestedFields?.[control.dataset.requestKey];label=field?.label;page=field?.source?.page;evidence=field?.source?.excerpt;value=field?.value;}
 else if(control.dataset.field){field=job.fields[control.dataset.field];label=control.dataset.field.replaceAll('_',' ');page=field?.page;value=field?.value;}
 else return;
 document.querySelectorAll('.field-selected').forEach(el=>el.classList.remove('field-selected'));control.closest('label')?.classList.add('field-selected');
 void viewer.locate([{text:evidence,kind:'evidence'},{text:value,kind:'value'},{text:label,kind:'label'}],page,label||'Selected field');
}
$('result').addEventListener('focusin',e=>locateControl(e.target));
$('result').addEventListener('click',e=>{if(e.target.matches('input,select'))locateControl(e.target);});
