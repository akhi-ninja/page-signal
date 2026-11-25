import test from 'node:test';import assert from 'node:assert/strict';import {resolveBusinessCandidates as resolve} from '../extensions/insurance/entity-resolution.mjs';
const submitted={legalName:'Example LLC',address:'100 Main St',jurisdiction:'MO',duns:'123456789'};const c={...submitted,id:'a',source:'synthetic registry',evidence:'fictional record'};
test('exact candidate requires review',()=>{const r=resolve({submitted,candidates:[c]});assert.equal(r.status,'candidate_review');assert.equal(r.requiresHumanReview,true)});
test('conflicting identifier blocks candidate',()=>assert.equal(resolve({submitted,candidates:[{...c,duns:'987654321'}]}).matches[0].status,'conflict'));
test('multiple candidates ambiguous',()=>assert.equal(resolve({submitted,candidates:[c,{...c,id:'b'}]}).status,'ambiguous'));
test('name alone insufficient',()=>assert.equal(resolve({submitted,candidates:[{id:'a',legalName:'Example LLC',source:'demo',evidence:'demo'}]}).status,'unresolved'));
test('missing evidence rejected',()=>assert.throws(()=>resolve({submitted,candidates:[{...c,evidence:''}]})));
