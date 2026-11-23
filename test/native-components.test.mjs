import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.test'});
for(const key of ['window','document','HTMLElement','Element','SVGElement','Node','Event','File','FileList','Blob'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let nextUrl=0;URL.createObjectURL=()=>`blob:test-${++nextUrl}`;URL.revokeObjectURL=()=>{};
async function audit(container){
 const {default:axe}=await import('axe-core');
 const results=await axe.run(container,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']},rules:{'color-contrast':{enabled:false}}});
 assert.deepEqual(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
 const {default:userEvent}=await import('@testing-library/user-event');
 const user=userEvent.setup({document});
 const source=[...container.querySelectorAll('button')].find(b=>b.textContent==='Show source');
 await user.click(source);await pause();assert.equal(document.activeElement.getAttribute('aria-label'),'Document preview; scroll to inspect');
 await user.tab();assert.ok(document.activeElement!==source,'keyboard can leave preview');
}
const pause=()=>new Promise(r=>setTimeout(r,0));
const file=()=>new File(['image'],'policy.png',{type:'image/png'});
function upload(container){const input=container.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[file()],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));}
const adapter={extract:async()=>({document_type:'policy',fields:[{label:'Policy number',value:'P-42',source:{page:1,excerpt:'P-42',box:{x:0,y:0,width:.2,height:.1}}}]}),query:async()=>({answer:'P-42'})};
test('Vue mounts native upload, field review and preview without iframe',async()=>{
 const {createApp,nextTick}=await import('vue');const {PageSignalWorkspace}=await import('../packages/vue/index.mjs');
 const container=document.createElement('div');document.body.append(container);let changes=0;
 const app=createApp(PageSignalWorkspace,{adapter,enhancedPreview:true,onResultsChange:()=>changes++});app.mount(container);
 upload(container);await pause();await nextTick();
 assert.equal(container.querySelector('iframe'),null);assert.ok(container.querySelector('[aria-label="Document preview controls"]'));assert.ok([...container.querySelectorAll('button')].some(b=>b.textContent==='Show source'));assert.equal(container.querySelector('img').alt,'policy.png');
 assert.equal(container.querySelector('input:not([type=file])').value,'P-42');assert.ok(changes>0);
 await audit(container);app.unmount();container.remove();
});
test('React mounts native upload, field review and preview without iframe',async()=>{
 const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');const {PageSignalWorkspace}=await import('../packages/react/index.mjs');
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(createElement(PageSignalWorkspace,{adapter,enhancedPreview:true}));});
 await act(async()=>{upload(container);await pause();});
 assert.equal(container.querySelector('iframe'),null);assert.ok(container.querySelector('[aria-label="Document preview controls"]'));assert.ok([...container.querySelectorAll('button')].some(b=>b.textContent==='Show source'));assert.equal(container.querySelector('img').alt,'policy.png');assert.equal(container.querySelector('input:not([type=file])').value,'P-42');
 await act(async()=>audit(container));await act(async()=>root.unmount());container.remove();
});
test('Angular compiled package mounts native upload and preview without iframe',async()=>{
 await import('@angular/compiler');
 const {createApplication}=await import('@angular/platform-browser');const {createComponent}=await import('@angular/core');
 const {PageSignalWorkspaceComponent}=await import('../packages/angular/dist/fesm2022/pagesignal-angular.mjs');
 const app=await createApplication();const container=document.createElement('div');document.body.append(container);
 const component=createComponent(PageSignalWorkspaceComponent,{environmentInjector:app.injector,hostElement:container});component.setInput('adapter',adapter);component.setInput('enhancedPreview',true);app.attachView(component.hostView);component.changeDetectorRef.detectChanges();
 upload(container);await pause();component.changeDetectorRef.detectChanges();
 assert.equal(container.querySelector('iframe'),null);assert.ok(container.querySelector('[aria-label="Document preview controls"]'));assert.ok([...container.querySelectorAll('button')].some(b=>b.textContent==='Show source'));assert.equal(container.querySelector('img').alt,'policy.png');assert.equal(container.querySelector('input:not([type=file])').value,'P-42');
 const trusted=component.instance.preview;component.instance.store.updateField('1',0,'P-43');component.changeDetectorRef.detectChanges();
 assert.equal(component.instance.preview,trusted,'field edits must preserve the trusted preview URL');
 await audit(container);app.detachView(component.hostView);component.destroy();app.destroy();container.remove();
});
test('React custom field renderer and source callback use live workspace state',async()=>{
 const {createElement:h,act}=await import('react');const {createRoot}=await import('react-dom/client');const {PageSignalWorkspace}=await import('../packages/react/index.mjs');
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);let source;
 await act(async()=>root.render(h(PageSignalWorkspace,{adapter,enhancedPreview:true,onSourceNavigate:s=>source=s,renderField:({field,update,showSource})=>h('div',null,h('label',null,'Custom '+field.label,h('input',{value:field.value,onChange:e=>update(e.target.value)})),h('button',{type:'button',onClick:showSource},'Locate custom field'))})));
 await act(async()=>{upload(container);await pause();});assert.match(container.textContent,/Custom Policy number/);
 await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='Locate custom field').click();await pause();});assert.equal(source.page,1);
 await act(async()=>root.unmount());container.remove();
});
test('Vue scoped field slot receives update and source actions',async()=>{
 const {createApp,h,nextTick}=await import('vue');const {PageSignalWorkspace}=await import('../packages/vue/index.mjs');const container=document.createElement('div');document.body.append(container);
 const app=createApp({render:()=>h(PageSignalWorkspace,{adapter,enhancedPreview:true},{field:({field,update})=>h('label',['Custom '+field.label,h('input',{value:field.value,onInput:e=>update(e.target.value)})])})});app.mount(container);upload(container);await pause();await nextTick();assert.match(container.textContent,/Custom Policy number/);const input=container.querySelector('input:not([type=file])');input.value='P-99';input.dispatchEvent(new Event('input',{bubbles:true}));await nextTick();assert.match(container.querySelector('pre').textContent,/P-99/);app.unmount();container.remove();
});
test('Angular custom TemplateRef receives document and headless controller',async()=>{
 await import('@angular/compiler');const {Component,createComponent}=await import('@angular/core');const {createApplication}=await import('@angular/platform-browser');const {PageSignalWorkspaceComponent}=await import('../packages/angular/dist/fesm2022/pagesignal-angular.mjs');
 class Host{adapter=adapter;}
 Component({selector:'quality-host',standalone:true,imports:[PageSignalWorkspaceComponent],template:'<ng-template #custom let-field let-doc="document" let-controller="controller" let-index="index"><label>Custom {{field.label}}<input [value]="field.value" (input)="controller.updateField(doc.id,index,$any($event.target).value)"></label></ng-template><pagesignal-workspace [adapter]="adapter" [fieldTemplate]="custom"></pagesignal-workspace>'})(Host);
 const app=await createApplication();const container=document.createElement('div');document.body.append(container);const component=createComponent(Host,{environmentInjector:app.injector,hostElement:container});app.attachView(component.hostView);component.changeDetectorRef.detectChanges();upload(container);await pause();component.changeDetectorRef.detectChanges();assert.match(container.textContent,/Custom Policy number/);app.detachView(component.hostView);component.destroy();app.destroy();container.remove();
});
