import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCommercialRiskRecord} from './domain.mjs';
const fixture=()=>({id:'risk-1',submissionId:'sub-1',lineOfBusiness:'commercial-property',currency:'USD',effectiveDate:'2027-01-01',expirationDate:'2028-01-01',account:{id:'a1',namedInsured:'Synthetic LLC'},locations:[{id:'l1',address:'Synthetic address',insuredValueMinorUnits:100000}],coverages:[{id:'c1',code:'building',limitMinorUnits:100000,deductibleMinorUnits:1000,locationIds:['l1']}]});
test('creates versioned draft with exact monetary units',()=>{const r=createCommercialRiskRecord(fixture());assert.equal(r.schemaVersion,'1.0');assert.equal(r.coverages[0].limit.minorUnits,100000);assert.equal(r.status,'draft');});
test('rejects impossible dates',()=>assert.throws(()=>createCommercialRiskRecord({...fixture(),effectiveDate:'2027-02-30'}),TypeError));
test('rejects unknown locations',()=>{const f=fixture();f.coverages[0].locationIds=['missing'];assert.throws(()=>createCommercialRiskRecord(f),TypeError);});
test('rejects fractional minor units',()=>{const f=fixture();f.coverages[0].limitMinorUnits=1.5;assert.throws(()=>createCommercialRiskRecord(f),TypeError);});
test('rejects duplicate locations',()=>{const f=fixture();f.locations.push(f.locations[0]);assert.throws(()=>createCommercialRiskRecord(f),TypeError);});
