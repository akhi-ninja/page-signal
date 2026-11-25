import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {parseChangelog,renderReleases} from '../scripts/build-releases.mjs';
const markdown=readFileSync('CHANGELOG.md','utf8'),metadata=JSON.parse(readFileSync('docs/releases.json','utf8'));
test('release history includes real published versions and distinguishes npm-only history',()=>{
 const html=renderReleases(markdown,metadata),dom=new JSDOM(html);const document=dom.window.document;
 assert.deepEqual(parseChangelog(markdown).map(r=>r.version),['2.0.0','1.1.1','0.1.0']);
 assert.equal(document.querySelectorAll('.history > article.release').length,3);
 const sync=document.getElementById('sync-v0.1.0');
 assert.equal(sync.closest('section').id,'sync-releases');
 assert.ok(sync.querySelector('a[href="https://www.npmjs.com/package/@pagesignal/sync/v/0.1.0"]'));
 assert.equal(document.querySelectorAll('#v0\\.1\\.0 a[href*="releases/tag"]').length,0);
 assert.match(document.querySelector('#react-migration').textContent,/src/);
 assert.match(document.querySelector('#react-migration').textContent,/adapter.extract/);
 assert.ok(!html.includes('0.0.0-stage'));
 assert.equal(document.querySelector('link[rel=canonical]').href,'https://www.pagesignal.studio/releases');
 assert.deepEqual(JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).hasPart.map(x=>x.name),['PageSignal 2.0.0','PageSignal 1.1.1','PageSignal 0.1.0']);
 dom.window.close();
});
test('release filters, migration links, keyboard tabs and copy work together',async()=>{
 const dom=new JSDOM(renderReleases(markdown,metadata),{runScripts:'outside-only',url:'https://www.pagesignal.studio/releases'});const {window}=dom;let copied='';
 Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
 window.eval(readFileSync('web/releases.js','utf8'));
 window.document.querySelector('[data-filter=breaking]').click();assert.equal([...window.document.querySelectorAll('.history > .release')].filter(x=>!x.hidden).length,1);
 assert.equal(window.document.getElementById('sync-v0.1.0').hidden,false);
 window.document.querySelector('a[href="#v0.1.0"]').click();assert.equal([...window.document.querySelectorAll('.history > .release')].filter(x=>!x.hidden).length,3);
 const tab=window.document.getElementById('tab-react');tab.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert.equal(window.document.activeElement.id,'tab-angular');assert.equal(window.document.getElementById('install-angular').hidden,false);assert.equal(window.document.getElementById('install-react').hidden,true);
 window.document.querySelector('[data-copy=install-angular]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(copied,'npm install @pagesignal/angular@2.0.0');
 dom.window.close();
});
test('new changelog versions appear without inventing dates and note text is escaped',()=>{
 const html=renderReleases('## 2.0.1\n\n- <script>example</script>\n\n'+markdown,metadata);
 assert.match(html,/id="v2.0.1"/);assert.match(html,/&lt;script&gt;example&lt;\/script&gt;/);assert.ok(!html.includes('<script>example'));
 assert.throws(()=>parseChangelog('## invalid\n- bad'),/stable version/);
});
