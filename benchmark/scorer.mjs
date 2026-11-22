// Offline scoring only: no network or model calls.
export const normalize = value => value === null ? null : String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim();
const ratio = (n, d) => d ? n / d : null;
const key = field => JSON.stringify([normalize(field.section ?? ''), normalize(field.label ?? '')]);
function grouped(fields = []) {
 const groups = new Map();
 for (const field of fields) { const k = key(field); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(field); }
 return groups;
}
export function scorePage(expected, actual, sourceText) {
 const counts = { pages:1, classified:0, expectedFields:0, predictedValues:0, expectedValues:0, correctValues:0, unsupportedValues:0, correctStates:0, matchedFields:0, evidenceEligible:0, correctEvidence:0, expectedCells:0, correctCells:0, extraCells:0 };
 counts.classified = Number(actual?.document_type === expected.document_type && normalize(actual?.form_number ?? null) === normalize(expected.form_number ?? null));
 const predictions = grouped(Array.isArray(actual?.fields) ? actual.fields : []);
 for (const field of expected.fields) {
  counts.expectedFields++;
  const prediction = predictions.get(key(field))?.shift();
  if (field.value !== null) counts.expectedValues++;
  if (!prediction) continue;
  counts.matchedFields++;
  counts.correctStates += Number(prediction.state === field.state);
  const correct = normalize(prediction.value) === normalize(field.value);
  if (prediction.value != null) {
   counts.predictedValues++;
   if (correct && field.value !== null) counts.correctValues++; else counts.unsupportedValues++;
  }
  if (field.value !== null) {
   counts.evidenceEligible++;
   const evidence = normalize(prediction.evidence ?? '');
   counts.correctEvidence += Number(correct && Boolean(evidence) && normalize(sourceText).includes(evidence) && evidence.includes(normalize(field.value)));
  }
 }
 for (const fields of predictions.values()) for (const field of fields) if (field.value != null) { counts.predictedValues++; counts.unsupportedValues++; }
 // Missing fields with values must also count against evidence recall.
 counts.evidenceEligible = counts.expectedValues;
 const tables = Array.isArray(actual?.tables) ? actual.tables : [];
 for (let t = 0; t < expected.tables.length; t++) {
  const wanted = expected.tables[t], received = tables[t];
  const wantedRows = [wanted.columns, ...wanted.rows];
  const receivedRows = received ? [received.columns ?? [], ...(received.rows ?? [])] : [];
  for (let r = 0; r < wantedRows.length; r++) for (let c = 0; c < wantedRows[r].length; c++) {
   counts.expectedCells++;
   counts.correctCells += Number(Array.isArray(receivedRows[r]) && c < receivedRows[r].length && normalize(receivedRows[r][c]) === normalize(wantedRows[r][c]));
  }
  receivedRows.forEach((row,r) => { counts.extraCells += Math.max(0, (Array.isArray(row) ? row.length : 0) - (wantedRows[r]?.length ?? 0)); });
 }
 for (const table of tables.slice(expected.tables.length)) counts.extraCells += (table.columns?.length ?? 0) + (table.rows ?? []).reduce((n,row)=>n+row.length,0);
 return counts;
}
export function summarize(counts) {
 return { counts, metrics: { classificationAccuracy:ratio(counts.classified,counts.pages), fieldPrecision:ratio(counts.correctValues,counts.predictedValues), fieldRecall:ratio(counts.correctValues,counts.expectedValues), unsupportedValueRate:ratio(counts.unsupportedValues,counts.predictedValues), fieldCoverage:ratio(counts.matchedFields,counts.expectedFields), stateAccuracy:ratio(counts.correctStates,counts.expectedFields), evidenceRecall:ratio(counts.correctEvidence,counts.evidenceEligible), tableCellAccuracy:ratio(counts.correctCells,counts.expectedCells), extraTableCells:counts.extraCells } };
}
export function scoreSuite(manifest, predictions) {
 const groups = new Map(), pages=[];
 for (const fixture of manifest.fixtures) {
  const result = predictions[fixture.id];
  const counts = scorePage(fixture.expected, result, fixture.text);
  pages.push({ id:fixture.id, missing:!result, ...summarize(counts) });
  for (const group of ['all', `category:${fixture.category}`, `quality:${fixture.quality}`]) {
   const total = groups.get(group) ?? {};
   for (const [key,value] of Object.entries(counts)) total[key] = (total[key] ?? 0) + value;
   groups.set(group,total);
  }
 }
 return { schemaVersion:1, sampleCount:pages.length, groups:Object.fromEntries([...groups].map(([name,counts])=>[name,summarize(counts)])), pages, unknownPredictionIds:Object.keys(predictions).filter(id=>!manifest.fixtures.some(f=>f.id===id)) };
}
