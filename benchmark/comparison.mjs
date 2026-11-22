const metrics = ['classificationAccuracy','fieldPrecision','fieldRecall','unsupportedValueRate','fieldCoverage','stateAccuracy','evidenceRecall','tableCellAccuracy'];
export function compareReports(baseline, candidate, { maxDrop = 0 } = {}) {
 if (!Number.isFinite(maxDrop) || maxDrop < 0 || maxDrop > 1) throw new Error('maxDrop must be between 0 and 1.');
 if (baseline?.schemaVersion !== 1 || candidate?.schemaVersion !== 1 || baseline.run?.manifestVersion !== candidate.run?.manifestVersion) throw new Error('Report schema and manifest versions must match.');
 const ids = report => report.pages?.map(p=>p.id).sort();
 const baseIds=ids(baseline), nextIds=ids(candidate);
 if (!baseIds?.length || JSON.stringify(baseIds)!==JSON.stringify(nextIds) || baseline.sampleCount!==baseIds.length || candidate.sampleCount!==nextIds.length) throw new Error('Reports must cover the same nonempty fixture IDs.');
 // Hashes are required: manual version labels cannot prove identical fixture inputs.
 if (!baseline.run.manifestSha256 || baseline.run.manifestSha256!==candidate.run.manifestSha256 || !baseline.run.fixtureInputsSha256 || baseline.run.fixtureInputsSha256!==candidate.run.fixtureInputsSha256) throw new Error('Reports must use identical fixture manifest and input hashes.');
 const changes=[], regressions=[];
 for (const [group, base] of Object.entries(baseline.groups ?? {})) {
  const next=candidate.groups?.[group];
  if (!next) throw new Error('Missing comparison group: '+group);
  for (const metric of metrics) {
   const before=base.metrics?.[metric], after=next.metrics?.[metric];
   if (before===null && after===null) continue;
   if (typeof before!=='number' || typeof after!=='number' || !Number.isFinite(before) || !Number.isFinite(after)) throw new Error('Metric cannot be compared: '+group+'/'+metric);
   const delta=after-before, regression=metric==='unsupportedValueRate'?delta>maxDrop+1e-12:delta < -maxDrop-1e-12;
   const change={group,metric,before,after,delta,regression};changes.push(change);if(regression)regressions.push(change);
  }
  const before=base.metrics?.extraTableCells, after=next.metrics?.extraTableCells;
  if (!Number.isInteger(before)||!Number.isInteger(after)) throw new Error('Invalid extra table cell counts.');
  if (after>before) regressions.push({group,metric:'extraTableCells',before,after,delta:after-before,regression:true});
 }
 return {schemaVersion:1,status:regressions.length?'regressed':'no_regression',maxDrop,changes,regressions,note:'Observed fixture differences only; not statistical significance or a production accuracy guarantee.'};
}
