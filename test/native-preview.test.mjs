import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPreview} from '../packages/sdk/preview.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(type='image/png',renderer){const dom=new JSDOM('<div id="host"></div>',{pretendToBeVisual:true});const host=dom.window.document.getElementById('host');let navigated;const controller=mountPreview(host,{file:{name:'example',type},url:'blob:example',renderer,onSourceNavigate:s=>navigated=s});return {dom,host,controller,navigated:()=>navigated};}
test('optional preview exposes named native keyboard controls, bounded zoom and source focus',async()=>{
 const {host,controller,dom,navigated}=setup();await tick();
 const buttons=[...host.querySelectorAll('button')];assert.ok(buttons.every(b=>b.type==='button'&&b.textContent));assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,true);
 for(let i=0;i<20;i++)buttons[3].click();assert.match(host.textContent,/300%/);buttons[4].click();assert.match(host.textContent,/100%/);
 assert.equal(controller.focusSource({page:1,excerpt:'Literal source',box:{x:.1,y:.2,width:.2,height:.1}}),true);await tick();assert.equal(dom.window.document.activeElement.getAttribute('aria-label'),'Document preview; scroll to inspect');assert.equal(navigated().page,1);assert.match(host.textContent,/Literal source/);
 assert.equal(controller.focusSource({page:1,box:{x:-1,y:0,width:.1,height:.1}}),false);
 controller.dispose();assert.equal(host.children.length,0);
});
test('page-only evidence never fabricates a box and PDF fallback explains limitations',async()=>{
 const {host,controller}=setup('application/pdf');await tick();controller.focusSource({page:1});await tick();assert.match(host.textContent,/verified value region is unavailable/);assert.equal(host.querySelector('[aria-hidden=true]').hidden,true);controller.dispose();
});
test('async PDF adapter ignores stale pages and aborts on disposal',async()=>{
 const pending=[];const renderer={getPageCount:async()=>3,renderPage:input=>new Promise(resolve=>pending.push({...input,resolve}))};
 const {host,controller}=setup('application/pdf',renderer);await tick();assert.equal(pending[0].page,1);
 [...host.querySelectorAll('button')][1].click();assert.equal(pending[0].signal.aborted,true);
 pending[1].container.textContent='page two';pending[1].resolve();await tick();pending[0].container.textContent='stale page one';pending[0].resolve();await tick();assert.match(host.textContent,/page two/);assert.ok(!host.textContent.includes('stale page one'));controller.dispose();assert.equal(pending[1].signal.aborted,true);
});
test('renderer failure is announced and untrusted evidence text stays text',async()=>{
 const {host,controller}=setup('application/pdf',{getPageCount:async()=>1,renderPage:async()=>{throw Error('private provider body');}});await tick();assert.match(host.textContent,/Preview unavailable/);assert.ok(!host.textContent.includes('private'));controller.dispose();
 const image=setup();image.controller.focusSource({page:1,excerpt:'<script>evil()</script>',box:{x:0,y:0,width:.5,height:.5}});await tick();assert.equal(image.host.querySelector('script'),null);image.controller.dispose();
});
test('default text/accent contrast exceeds AA text threshold and preview is scrollable',()=>{
 const luminance=hex=>{const c=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const hex of ['201a43','6630ce'])assert.ok(1.05/(luminance(hex)+.05)>4.5);
 const {host,controller}=setup();assert.equal(host.querySelector('[tabindex]').style.overflow,'auto');assert.equal(host.querySelector('[role=group]').style.flexWrap,'wrap');controller.dispose();
});
