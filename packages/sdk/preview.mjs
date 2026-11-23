/** Optional native preview. No PDF/OCR runtime, network calls or module-time DOM access. */
export function mountPreview(container,{file,url,renderer,onSourceNavigate}={}) {
 const doc=container.ownerDocument;
 let page=1,total=1,zoom=1,disposed=false,generation=0,abort,source=null;
 const root=doc.createElement('div');root.className='pagesignal-preview';
 root.style.cssText='color:var(--pagesignal-color,#201a43);background:var(--pagesignal-background,#fff);min-width:0';
 const toolbar=doc.createElement('div');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Document preview controls');toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center';
 const status=doc.createElement('p');status.setAttribute('role','status');
 const viewport=doc.createElement('div');viewport.style.cssText='overflow:auto;max-height:700px;position:relative';viewport.tabIndex=0;viewport.setAttribute('aria-label','Document preview; scroll to inspect');
 const surface=doc.createElement('div');surface.style.cssText='position:relative;width:100%;transform-origin:top left';
 const content=doc.createElement('div');const overlay=doc.createElement('div');overlay.hidden=true;overlay.setAttribute('aria-hidden','true');overlay.style.cssText='position:absolute;pointer-events:none;border:3px solid var(--pagesignal-accent,#6630ce);background:rgba(102,48,206,.12);box-sizing:border-box';
 surface.append(content,overlay);viewport.append(surface);
 const count=doc.createElement('span');
 function button(label,action){const b=doc.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);toolbar.append(b);return b;}
 const prev=button('Previous page',()=>navigate(page-1));toolbar.append(count);
 const next=button('Next page',()=>navigate(page+1));
 button('Zoom out',()=>scale(zoom-.25));button('Zoom in',()=>scale(zoom+.25));button('Fit width',()=>scale(1));
 root.append(toolbar,status,viewport);container.replaceChildren(root);
 function scale(value){zoom=Math.max(.5,Math.min(3,value));surface.style.width=`${zoom*100}%`;count.textContent=`Page ${page} of ${total} · ${Math.round(zoom*100)}%`;}
 function highlight(){overlay.hidden=true;if(!source||source.page!==page)return;
  const b=source.box;
  if(!b){status.textContent='Source page located; a verified value region is unavailable.';return;}
  if(file.type==='application/pdf'&&!renderer){status.textContent='Use a page renderer for PDF evidence overlays.';return;}
  overlay.hidden=false;Object.assign(overlay.style,{left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`});
  status.textContent=source.excerpt||'Source region highlighted. Verify against the original.';
 }
 async function render(){const version=++generation;abort?.abort();abort=new AbortController();overlay.hidden=true;status.textContent='Loading preview…';prev.disabled=page<=1;next.disabled=page>=total;scale(zoom);
  const staging=doc.createElement('div');
  try{
   if(renderer)await renderer.renderPage({file,page,container:staging,signal:abort.signal});
   else if(file.type==='application/pdf'){
    const object=doc.createElement('object');object.data=url;object.type='application/pdf';object.setAttribute('aria-label','PDF document preview');object.style.cssText='width:100%;height:650px';
    const link=doc.createElement('a');link.href=url;link.textContent='Open original PDF';link.target='_blank';link.rel='noopener';object.append(link);staging.append(object);
   }else{const img=doc.createElement('img');img.src=url;img.alt=file.name;img.style.cssText='display:block;width:100%;height:auto';staging.append(img);}
   if(disposed||version!==generation)return;
   content.replaceChildren(...staging.childNodes);status.textContent=file.type==='application/pdf'&&!renderer?'Native PDF preview. Configure a page renderer for page navigation and evidence overlays.':'Preview ready.';highlight();
  }catch(e){if(!disposed&&version===generation){content.replaceChildren();status.textContent='Preview unavailable. Try selecting the document again.';}}
 }
 function navigate(value){if(!Number.isInteger(value)||value<1||value>total)return;page=value;render();}
 async function init(){try{if(renderer){total=await renderer.getPageCount({file,signal:(abort=new AbortController()).signal});if(!Number.isInteger(total)||total<1||total>10000)throw Error('Invalid page count');}if(!disposed)render();}catch{if(!disposed)status.textContent='Unable to read document page count.';}}
 init();
 return {
  focusSource(value){
   source=null;overlay.hidden=true;
   if(disposed||!value||!Number.isInteger(value.page)||value.page<1||value.page>total){status.textContent='Source page unavailable.';return false;}
   const b=value.box;
   if(b&&(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1||b.y+b.height>1)){status.textContent='Invalid source coordinates; no region highlighted.';return false;}
   source=value;page=value.page;render();viewport.focus();onSourceNavigate?.(value);return true;
  },
  dispose(){disposed=true;++generation;abort?.abort();root.remove();}
 };
}
