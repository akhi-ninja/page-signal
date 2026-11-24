import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createConnectorHub,mapConnectorFields} from '../extensions/connectors/index.mjs';
const d={id:'demo',name:'Demo',category:'test',synthetic:true,execute:()=>({fields:[{key:'name',value:'Example',evidence:'fixture'}]})};
test('catalog and evidence mapping',async()=>{const h=createConnectorHub([d]);assert.equal(h.list()[0].id,'demo');const r=await h.test('demo',{synthetic:true});assert.equal(mapConnectorFields(r,[{source:'name',target:'legal_name'}])[0].source,'demo')});
test('reject live definitions',()=>assert.throws(()=>createConnectorHub([{...d,synthetic:false}])));
test('reject missing evidence',async()=>{const h=createConnectorHub([{...d,execute:()=>({fields:[{key:'name',value:'x'}]})}]);assert.equal((await h.test('demo',{synthetic:true})).status,'unavailable')});
test('browser parity',()=>assert.equal(readFileSync(new URL('../extensions/connectors/index.mjs',import.meta.url),'utf8'),readFileSync(new URL('../web/connectors/engine/connector-hub.mjs',import.meta.url),'utf8')));
