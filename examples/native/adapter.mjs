import {previewRenderer} from './pdf-renderer.mjs';
// Local rendering + same-origin requests. Keys, authentication and quotas belong on the server.
export const adapter={async extract({file,signal}){
 if(!file.size||file.size>30*1024*1024)throw Error('Choose a document up to 30 MiB.');
 const count=await previewRenderer.getPageCount({file,signal});const pages=[];
 for(let page=1;page<=count;page++){
  signal.throwIfAborted();const container=document.createElement('div');
  await previewRenderer.renderPage({file,page,container,signal});const canvas=container.querySelector('canvas');
  const image=canvas.toDataURL('image/jpeg',.85);canvas.width=canvas.height=0;
  const response=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,text:''}),signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Extraction failed');pages.push({page,...data});
 }
 return {document_type:pages[0].document_type,pages,fields:pages.flatMap(p=>p.fields.map(f=>({...f,source:{page:p.page,excerpt:f.evidence||undefined}})))};
}};
