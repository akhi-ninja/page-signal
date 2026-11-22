import { cropRegion } from './document-quality.mjs';
// Coordinates are derived from the PDF text layer or local OCR, never guessed by AI.
const tokens = value => String(value ?? '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
export function locateEvidence(pageWords, candidates, preferredPage) {
  const ordered=Object.keys(pageWords||{}).map(Number).sort((a,b)=>(a===preferredPage?-1:b===preferredPage?1:a-b));
  for(const candidate of candidates){
    const needle=tokens(candidate.text);if(!needle.length)continue;
    for(const page of ordered){
      const words=(pageWords[page]||[]).flatMap(word=>tokens(word.text).map(text=>({...word,text})));
      const matches=[];
      for(let i=0;i<=words.length-needle.length;i++)if(needle.every((text,j)=>words[i+j].text===text)){
        matches.push(words.slice(i,i+needle.length));if(matches.length===20)break;
      }
      if(matches.length)return {page,kind:candidate.kind,matches};
    }
  }
  return null;
}
export function pdfWordBoxes(items, viewport, transform) {
  return items.filter(item=>item.str?.trim()).map(item=>{
    const t=transform(viewport.transform,item.transform);
    const advance=Math.max(item.width*viewport.scale,1),length=Math.hypot(t[0],t[1])||1;
    const dx=t[0]/length*advance,dy=t[1]/length*advance;
    const xs=[t[4],t[4]+dx,t[4]+t[2],t[4]+dx+t[2]],ys=[t[5],t[5]+dy,t[5]+t[3],t[5]+dy+t[3]];
    return {text:item.str,x:Math.max(0,Math.min(...xs)/viewport.width),y:Math.max(0,Math.min(...ys)/viewport.height),
      width:Math.min(1,Math.max(1,Math.max(...xs)-Math.min(...xs))/viewport.width),height:Math.max(1,Math.max(...ys)-Math.min(...ys))/viewport.height};
  });
}
export function ocrWordBoxes(data,width,height) {
  const words=data.words||data.blocks?.flatMap(b=>b.paragraphs?.flatMap(p=>p.lines?.flatMap(l=>l.words||[])||[])||[])||[];
  return words.filter(w=>w.text?.trim()&&w.bbox).map(w=>({text:w.text,x:w.bbox.x0/width,y:w.bbox.y0/height,width:(w.bbox.x1-w.bbox.x0)/width,height:(w.bbox.y1-w.bbox.y0)/height}));
}
export function uniqueSourceRegion(pageWords,candidates,page){
 const match=locateEvidence({[page]:pageWords?.[page]||[]},candidates,page);
 if(!match||match.matches.length!==1||match.kind==='label')throw new Error('A unique value or evidence location is required. Review the original page manually.');
 const words=match.matches[0];const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y));
 const right=Math.min(1,Math.max(...words.map(w=>w.x+w.width))),bottom=Math.min(1,Math.max(...words.map(w=>w.y+w.height)));
 const box={x,y,width:right-x,height:bottom-y};cropRegion(box,1000,1000);return box;
}
export class DocumentViewer {
  constructor(host,job,loadPdf){this.host=host;this.job=job;this.loadPdf=loadPdf;this.version=0;this.zoom=1;this.page=job.previewPage||1;this.cancelled=false;this.mount();}
  mount(){
    this.host.innerHTML='<div class="preview-toolbar"><button type="button" data-view="previous" aria-label="Previous page">←</button><label>Page <input data-page type="number" min="1" value="'+this.page+'" max="'+this.job.pages+'" aria-label="Document page"></label><span>of '+this.job.pages+'</span><button type="button" data-view="next" aria-label="Next page">→</button><button type="button" data-view="out" aria-label="Zoom out">−</button><button type="button" data-view="in" aria-label="Zoom in">+</button><button type="button" data-view="fit">Fit width</button><a target="_blank" rel="noopener" class="original-link">Open original ↗</a></div><p class="preview-message" role="status">Click a field to locate its source.</p><div class="preview-scroll" tabindex="0" aria-label="Scrollable document page"><div class="preview-sheet"><canvas aria-label="Document page image"></canvas><div class="source-highlights" aria-hidden="true"></div></div></div>';
    this.host.querySelector('a').href=this.job.url;
    this.host.querySelector('[data-page]').addEventListener('change',e=>{this.page=Math.max(1,Math.min(this.job.pages,Number(e.target.value)||1));this.selection=null;void this.draw();});
    this.host.addEventListener('click',e=>{const action=e.target.closest('[data-view]')?.dataset.view;if(!action)return;
      if(action==='previous')this.page=Math.max(1,this.page-1);if(action==='next')this.page=Math.min(this.job.pages,this.page+1);
      if(action==='in')this.zoom=Math.min(3,this.zoom+.25);if(action==='out')this.zoom=Math.max(.5,this.zoom-.25);if(action==='fit')this.zoom=1;
      if(['previous','next'].includes(action))this.selection=null;void this.draw();});
    this.resize=new ResizeObserver(()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.cancelled)void this.draw();},150);});this.resize.observe(this.host);
    void this.draw();
  }
  async draw(){
    const version=++this.version;this.renderedPage=null;this.renderTask?.cancel();
    const canvas=this.host.querySelector('canvas'),sheet=this.host.querySelector('.preview-sheet'),scroll=this.host.querySelector('.preview-scroll');
    this.host.querySelector('[data-page]').value=this.page;this.job.previewPage=this.page;
    this.host.querySelector('[data-view="previous"]').disabled=this.page===1;this.host.querySelector('[data-view="next"]').disabled=this.page===this.job.pages;
    try{
      const width=Math.max(280,scroll.clientWidth-40)*this.zoom;
      // Render into an offscreen canvas so stale renders cannot corrupt the current page.
      const buffer=document.createElement('canvas');let height;
      if(this.job.pdf){
        const pdfjs=await this.loadPdf();if(this.cancelled||version!==this.version)return;
        if(!this.pdfTask)this.pdfTask=pdfjs.getDocument({data:new Uint8Array(await this.job.file.arrayBuffer()),isEvalSupported:false});
        const pdf=await this.pdfTask.promise,page=await pdf.getPage(this.page);if(this.cancelled||version!==this.version)return;
        const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:width/base.width});height=viewport.height;
        const ratio=Math.min(devicePixelRatio||1,2);buffer.width=Math.ceil(width*ratio);buffer.height=Math.ceil(height*ratio);
        this.renderTask=page.render({canvasContext:buffer.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});await this.renderTask.promise;page.cleanup();
      }else{
        const bitmap=await createImageBitmap(this.job.file);height=width*bitmap.height/bitmap.width;
        buffer.width=Math.ceil(width);buffer.height=Math.ceil(height);buffer.getContext('2d').drawImage(bitmap,0,0,width,height);bitmap.close();
      }
      if(this.cancelled||version!==this.version)return;
      canvas.width=buffer.width;canvas.height=buffer.height;canvas.getContext('2d').drawImage(buffer,0,0);canvas.style.width=width+'px';canvas.style.height=height+'px';sheet.style.width=width+'px';sheet.style.height=height+'px';
      this.renderedPage=this.page;this.renderedVersion=version;this.paint();
    }catch(error){if(error.name!=='RenderingCancelledException'&&!this.cancelled)this.message('Preview could not render. Use Open original to verify this document.');}
  }
  message(text){this.host.querySelector('.preview-message').textContent=text;}
  async locate(candidates,page,label){
    this.selection=locateEvidence(this.job.pageWords,candidates,page);
    if(this.selection)this.page=this.selection.page;else if(page)this.page=page;
    this.job.previewPage=this.page;await this.draw();
    if(!this.selection){this.message(label+': no reliable text location found. Showing '+(page?'the source page':'the current page')+' without a highlight.');return;}
    const match=this.selection;
    this.message(label+': '+(match.kind==='label'?'field label located; verify its value':match.matches.length>1?'multiple text matches highlighted; verify the correct occurrence':'source text highlighted')+' · page '+match.page+'.');
    const mark=this.host.querySelector('.source-highlight');mark?.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
  }
  async cropSource(candidates,page){
    const box=uniqueSourceRegion(this.job.pageWords,candidates,page);
    this.page=page;const expectedVersion=this.version+1;await this.draw();
    if(this.cancelled||this.page!==page||this.renderedPage!==page||this.renderedVersion!==expectedVersion)throw new Error('Document preview changed. Please try again.');
    const source=this.host.querySelector('canvas');
    const region=cropRegion(box,source.width,source.height,.06);
    const crop=document.createElement('canvas');crop.width=region.width;crop.height=region.height;
    crop.getContext('2d').drawImage(source,region.x,region.y,region.width,region.height,0,0,region.width,region.height);
    return {image:crop.toDataURL('image/jpeg',.9),source:{page,region:box,padding:.06}};
  }
  paint(){
    const layer=this.host.querySelector('.source-highlights');layer.replaceChildren();if(!this.selection||this.selection.page!==this.page)return;
    for(const [group,words] of this.selection.matches.entries())for(const [index,word] of words.entries()){
      const mark=document.createElement('span');mark.className='source-highlight'+(index===0?' source-arrow':'');mark.style.left=word.x*100+'%';mark.style.top=word.y*100+'%';mark.style.width=word.width*100+'%';mark.style.height=word.height*100+'%';layer.append(mark);
    }
  }
  destroy(){this.cancelled=true;this.version++;clearTimeout(this.timer);this.resize?.disconnect();this.renderTask?.cancel();void this.pdfTask?.destroy();}
}
