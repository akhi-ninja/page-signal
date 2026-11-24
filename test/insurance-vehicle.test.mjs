import test from 'node:test';import assert from 'node:assert/strict';import {reviewVehicle} from '../extensions/insurance/vehicle.mjs';import {readFileSync} from 'node:fs';
const submitted={vin:'1M8GDM9AXKP042788',year:2020};const record={...submitted,year:2021,source:'demo',evidence:'fictional'};
test('vehicle discrepancy',()=>assert.equal(reviewVehicle({synthetic:true,submitted,record}).findings[0].field,'year'));
test('VIN mismatch',()=>assert.equal(reviewVehicle({synthetic:true,submitted,record:{...record,vin:'bad'}}).vinMatches,false));
test('synthetic only',()=>assert.throws(()=>reviewVehicle({submitted,record})));
test('browser parity',()=>{for(const f of ['vehicle','clearance','entity-resolution'])assert.equal(readFileSync(new URL('../extensions/insurance/'+f+'.mjs',import.meta.url),'utf8'),readFileSync(new URL('../web/insurance/engine/'+f+'.mjs',import.meta.url),'utf8'))});
