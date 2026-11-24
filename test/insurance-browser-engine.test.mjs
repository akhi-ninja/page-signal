import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('browser insurance modules match standalone engines',()=>{for(const n of ["index","commercial","acord","acord-mapping","loss-runs"])assert.equal(readFileSync('web/insurance/engine/'+n+'.mjs','utf8'),readFileSync('extensions/insurance/'+n+'.mjs','utf8'));});
