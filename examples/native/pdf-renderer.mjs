// Host-owned optional renderer. PDF.js is a dev/example dependency, never a UI package dependency.
async function withPdf(file,signal,work){
 signal.throwIfAborted();
 const pdfjs=await import('pdfjs-dist');
 const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
 pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
 const cancel=()=>{void task.destroy();};signal.addEventListener('abort',cancel,{once:true});
 try{signal.throwIfAborted();const pdf=await task.promise;if(pdf.numPages>40)throw Error('Example supports at most 40 PDF pages.');return await work(pdf);}
 finally{signal.removeEventListener('abort',cancel);await task.destroy();}
}
export const previewRenderer={
 async getPageCount({file,signal}){return file.type==='application/pdf'?withPdf(file,signal,pdf=>pdf.numPages):1;},
 async renderPage({file,page,container,signal}){
  signal.throwIfAborted();
  const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:auto';container.append(canvas);
  if(file.type!=='application/pdf'){
   const image=await createImageBitmap(file);try{signal.throwIfAborted();const scale=Math.min(1,1800/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);}finally{image.close();}return;
  }
  await withPdf(file,signal,async pdf=>{const source=await pdf.getPage(page);const original=source.getViewport({scale:1});const viewport=source.getViewport({scale:Math.min(2,1800/Math.max(original.width,original.height))});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const render=source.render({canvas,canvasContext:canvas.getContext('2d'),viewport});const cancel=()=>render.cancel();signal.addEventListener('abort',cancel,{once:true});try{signal.throwIfAborted();await render.promise;}finally{signal.removeEventListener('abort',cancel);source.cleanup();}});
 }
};
