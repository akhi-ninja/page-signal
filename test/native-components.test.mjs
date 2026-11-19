import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.test'});
for(const key of ['window','document','HTMLElement','Element','SVGElement','Node','Event','File','FileList','Blob'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let nextUrl=0;URL.createObjectURL=()=>`blob:test-${++nextUrl}`;URL.revokeObjectURL=()=>{};
const pause=()=>new Promise(r=>setTimeout(r,0));
const file=()=>new File(['image'],'policy.png',{type:'image/png'});
function upload(container){const input=container.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[file()],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));}
const adapter={extract:async()=>({document_type:'policy',fields:[{label:'Policy number',value:'P-42'}]}),query:async()=>({answer:'P-42'})};
test('Vue mounts native upload, field review and preview without iframe',async()=>{
 const {createApp,nextTick}=await import('vue');const {PageSignalWorkspace}=await import('../packages/vue/index.mjs');
 const container=document.createElement('div');document.body.append(container);let changes=0;
 const app=createApp(PageSignalWorkspace,{adapter,onResultsChange:()=>changes++});app.mount(container);
 upload(container);await pause();await nextTick();
 assert.equal(container.querySelector('iframe'),null);assert.equal(container.querySelector('img').alt,'policy.png');
 assert.equal(container.querySelector('input:not([type=file])').value,'P-42');assert.ok(changes>0);
 app.unmount();container.remove();
});
test('React mounts native upload, field review and preview without iframe',async()=>{
 const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');const {PageSignalWorkspace}=await import('../packages/react/index.mjs');
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(createElement(PageSignalWorkspace,{adapter}));});
 await act(async()=>{upload(container);await pause();});
 assert.equal(container.querySelector('iframe'),null);assert.equal(container.querySelector('img').alt,'policy.png');assert.equal(container.querySelector('input:not([type=file])').value,'P-42');
 await act(async()=>root.unmount());container.remove();
});
test('Angular compiled package mounts native upload and preview without iframe',async()=>{
 await import('@angular/compiler');
 const {createApplication}=await import('@angular/platform-browser');const {createComponent}=await import('@angular/core');
 const {PageSignalWorkspaceComponent}=await import('../packages/angular/dist/fesm2022/pagesignal-angular.mjs');
 const app=await createApplication();const container=document.createElement('div');document.body.append(container);
 const component=createComponent(PageSignalWorkspaceComponent,{environmentInjector:app.injector,hostElement:container});component.setInput('adapter',adapter);app.attachView(component.hostView);component.changeDetectorRef.detectChanges();
 upload(container);await pause();component.changeDetectorRef.detectChanges();
 assert.equal(container.querySelector('iframe'),null);assert.equal(container.querySelector('img').alt,'policy.png');assert.equal(container.querySelector('input:not([type=file])').value,'P-42');
 const trusted=component.instance.preview;component.instance.store.updateField('1',0,'P-43');component.changeDetectorRef.detectChanges();
 assert.equal(component.instance.preview,trusted,'field edits must preserve the trusted preview URL');
 app.detachView(component.hostView);component.destroy();app.destroy();container.remove();
});
