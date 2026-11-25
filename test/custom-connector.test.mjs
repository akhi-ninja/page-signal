import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {defineCustomConnector,simulateCustomConnector} from '../extensions/connectors/custom.mjs';
const c={id:'demo',name:'Demo',method:'GET',endpoint:'https://example.com/api',mappings:[{key:'revenue',path:'business.revenue'}]};
test('offline mapping',()=>assert.equal(simulateCustomConnector(c,{business:{revenue:42}}).fields[0].value,42));
test('missing path',()=>assert.equal(simulateCustomConnector(c,{}).fields[0].status,'missing'));
test('reject credentials and unsafe paths',()=>{assert.throws(()=>defineCustomConnector({...c,endpoint:'https://user:pass@example.com'}));assert.throws(()=>defineCustomConnector({...c,mappings:[{key:'x',path:'constructor.prototype'}]}))});
test('browser parity',()=>{for(const f of ['custom','intelligence'])assert.equal(readFileSync(new URL('../extensions/connectors/'+f+'.mjs',import.meta.url),'utf8'),readFileSync(new URL('../web/studio/engine/'+f+'.mjs',import.meta.url),'utf8'))});
