import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createOCRLoader} from '../web/ocr-loader.mjs';

test('OCR stays unloaded until requested and concurrent requests share one library download',async()=>{
 const dom=new JSDOM('<head></head>'),{window}=dom;const load=createOCRLoader({getWindow:()=>window,getDocument:()=>window.document});
 try{
  assert.equal(window.document.scripts.length,0);const first=load(),second=load();assert.equal(first,second);assert.equal(window.document.scripts.length,1);
  const library={createWorker(){}};window.Tesseract=library;window.document.scripts[0].dispatchEvent(new window.Event('load'));
  assert.equal(await first,library);assert.equal(await load(),library);assert.equal(window.document.scripts.length,1);
 }finally{window.close();}
});
test('OCR loading failure permits retry and reuses the next successful download',async()=>{
 const dom=new JSDOM('<head></head>'),{window}=dom;const load=createOCRLoader({getWindow:()=>window,getDocument:()=>window.document});
 try{const first=load();window.document.scripts[0].dispatchEvent(new window.Event('error'));await assert.rejects(first,/could not load/);assert.equal(window.document.scripts.length,0);const retry=load();window.Tesseract={};window.document.scripts[0].dispatchEvent(new window.Event('load'));assert.equal(await retry,window.Tesseract);}finally{window.close();}
});
test('OCR load timeout releases the failed request for retry',async()=>{
 const dom=new JSDOM('<head></head>'),{window}=dom;const load=createOCRLoader({getWindow:()=>window,getDocument:()=>window.document,timeoutMs:5});
 try{await assert.rejects(load(),/could not load/);assert.equal(window.document.scripts.length,0);}finally{window.close();}
});
