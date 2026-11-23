import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Node-only benchmark ingestion. Scans use an explicitly labeled fixture transcript, not hidden OCR. */
export async function fixtureInput(fixture,root){
 if(!fixture.sourcePdf)return {image:'data:image/jpeg;base64,'+(await readFile(resolve(root,fixture.image))).toString('base64'),text:fixture.text,textMode:fixture.text?'fixture_transcript':'vision_only'};
 const canvas=await import('@napi-rs/canvas');for(const name of ['DOMMatrix','ImageData','Path2D'])globalThis[name]??=canvas[name];
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(await readFile(resolve(root,fixture.sourcePdf))),isEvalSupported:false,useSystemFonts:true});
 try{const pdf=await task.promise;const page=await pdf.getPage(fixture.sourcePage);const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,2300/Math.max(base.width,base.height))});const surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:surface.getContext('2d'),viewport,canvas:surface}).promise;const text=(await page.getTextContent()).items.map(x=>x.str).join('\n');return {image:'data:image/jpeg;base64,'+surface.toBuffer('image/jpeg',85).toString('base64'),text:text.trim()||fixture.text,textMode:text.trim()?'pdf_text_layer':'fixture_transcript'};}finally{await task.destroy();}
}
