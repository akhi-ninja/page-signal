import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identifyAcordPages,selectAcordProfile} from './acord.mjs';
const identify=text=>identifyAcordPages([{page:1,text}])[0];
test('identifies synthetic footer with revision and evidence',()=>{const r=identify('Synthetic sample\nACORD 125 (2020/01)');assert.equal(r.kind,'commercial-application');assert.equal(r.revision,'2020-01');assert.equal(r.reviewRequired,true);});
test('does not guess missing revision',()=>assert.equal(identify('ACORD 140').status,'revision_unknown'));
test('ambiguous markers require review',()=>assert.equal(identify('ACORD 125 (2020/01)\nACORD 126 (2020/01)').status,'ambiguous'));
test('unsupported form and incidental mention',()=>{assert.equal(identify('ACORD 999 (2020/01)').status,'unsupported');assert.equal(identify('Please provide ACORD 125').status,'unidentified');});
test('selects only exact customer revision',()=>{const r=identify('ACORD 125 (2020/01)');const p={formNumber:'125',revision:'2020-01',fields:[]};assert.deepEqual(selectAcordProfile(r,[p]),p);assert.equal(selectAcordProfile(r,[{...p,revision:'2021-01'}]),null);assert.throws(()=>selectAcordProfile(r,[p,p]),TypeError);});
