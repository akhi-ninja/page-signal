import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {fixtureInput} from '../benchmark/pdf-input.mjs';
test('benchmark renders real text/scanned/mixed PDFs and labels transcript-assisted scans honestly',async()=>{
 const manifest=JSON.parse(await readFile('benchmark/fixtures/manifest.json'));const cases=manifest.fixtures.filter(f=>f.sourcePdf);assert.equal(cases.length,5);
 for(const f of cases){const page=await fixtureInput(f,'benchmark/fixtures');assert.match(page.image,/^data:image\/jpeg;base64,/);assert.ok(page.image.length>1000);assert.equal(page.textMode,f.quality.startsWith('scanned')?'fixture_transcript':'pdf_text_layer');}
 const drawn=manifest.fixtures.find(f=>f.id==='receipt-drawn-strokes');assert.equal(drawn.text,'');assert.match(drawn.provenance,/Not real human handwriting/);
});
