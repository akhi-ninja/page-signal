import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReports } from '../benchmark/comparison.mjs';
function report(overrides={}) {
 const metrics={classificationAccuracy:1,fieldPrecision:1,fieldRecall:1,unsupportedValueRate:0,fieldCoverage:1,stateAccuracy:1,evidenceRecall:1,tableCellAccuracy:null,extraTableCells:0,...overrides};
 return {schemaVersion:1,sampleCount:1,run:{manifestVersion:1,manifestSha256:'fixture-digest',fixtureInputsSha256:'image-digest'},pages:[{id:'a'}],groups:{all:{metrics},'quality:clean':{metrics:{...metrics}}}};
}
test('comparison detects lower recall and higher unsupported values by group',()=>{
 const r=compareReports(report(),report({fieldRecall:.8,unsupportedValueRate:.2}));assert.equal(r.status,'regressed');assert.equal(r.regressions.length,4);
});
test('comparison accepts equal or improved results and explicit tolerances',()=>{
 assert.equal(compareReports(report({fieldRecall:.8}),report()).status,'no_regression');
 assert.equal(compareReports(report(),report({fieldRecall:.99}),{maxDrop:.01}).status,'no_regression');
 assert.equal(compareReports(report(),report({extraTableCells:1})).status,'regressed');
});
test('incomparable corpus, undefined metrics and bad tolerances fail closed',()=>{
 const a=report(),b=report();b.pages[0].id='b';assert.throws(()=>compareReports(a,b),/fixture IDs/);
 b.pages[0].id='a';b.run.manifestSha256='different';assert.throws(()=>compareReports(a,b),/hashes/);
 assert.throws(()=>compareReports(report(),report({fieldRecall:null})),/cannot be compared/);
 assert.throws(()=>compareReports(report(),report(),{maxDrop:NaN}),/maxDrop/);
});
