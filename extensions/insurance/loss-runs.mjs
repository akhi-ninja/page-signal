// Deterministic normalization of adopter-mapped claim rows; no OCR or network.
const requiredText = v => typeof v === 'string' && !!v.trim();
const date = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const money = v => Number.isSafeInteger(v);
const identity = r => JSON.stringify([r.carrier.trim(),r.policyNumber.trim(),r.claimNumber.trim()]);
export function reconcileLossRuns({currency, rows}) {
 if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||!Array.isArray(rows)) throw new TypeError('Invalid loss run');
 const findings=[], claims=[], groups=new Map(), seen=new Set();
 for(const row of rows){
  if(!row || !requiredText(row.id)||seen.has(row.id)||!requiredText(row.documentId)||!Number.isSafeInteger(row.page)||row.page<1) throw new TypeError('Invalid or duplicate row reference');
  seen.add(row.id);
  const r=structuredClone(row);
  const issue=reason=>findings.push({rowId:r.id,reason});
  if(!requiredText(r.carrier)||!requiredText(r.policyNumber)||!requiredText(r.claimNumber)){issue('missing_identity');continue;}
  if(r.currency!==currency){issue('currency_mismatch');continue;}
  if(!date(r.lossDate)||!date(r.valuationDate)||r.lossDate>r.valuationDate){issue('invalid_dates');continue;}
  if(!['open','closed','reopened','unknown'].includes(r.status)){issue('invalid_status');continue;}
  if(r.status==='unknown')issue('unknown_status');
  if(![r.paidMinor,r.reserveMinor,r.incurredMinor].every(money)){issue('invalid_amount');continue;}
  if(!Number.isSafeInteger(r.paidMinor+r.reserveMinor)||r.paidMinor+r.reserveMinor!==r.incurredMinor)issue('incurred_mismatch');
  if(r.paidMinor<0||r.reserveMinor<0||r.incurredMinor<0)issue('negative_amount_review');
  if(!requiredText(r.evidence))issue('missing_evidence');
  const key=identity(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 for(const snapshots of groups.values()){
  snapshots.sort((a,b)=>b.valuationDate.localeCompare(a.valuationDate));
  const latest=snapshots.filter(r=>r.valuationDate===snapshots[0].valuationDate);
  const signature=r=>JSON.stringify([r.lossDate,r.status,r.paidMinor,r.reserveMinor,r.incurredMinor,r.coverage??null,r.description??null]);
  const conflict=new Set(latest.map(signature)).size>1;
  if(conflict)findings.push({rowIds:latest.map(r=>r.id),reason:'conflicting_latest_snapshots'});
  else if(latest.length>1)findings.push({rowIds:latest.map(r=>r.id),reason:'duplicate_snapshot'});
  claims.push({carrier:snapshots[0].carrier,policyNumber:snapshots[0].policyNumber,claimNumber:snapshots[0].claimNumber,latest:conflict?null:latest[0],snapshots});
 }
 const totals={paidMinor:0,reserveMinor:0,incurredMinor:0};
 const excluded=new Set(findings.filter(f=>!['duplicate_snapshot'].includes(f.reason)).flatMap(f=>f.rowIds??[f.rowId]));
 for(const claim of claims){
  if(!claim.latest||claim.snapshots.some(r=>r.valuationDate===claim.latest.valuationDate&&excluded.has(r.id)))continue;
  for(const key of Object.keys(totals)){const n=totals[key]+claim.latest[key];if(!money(n))throw new RangeError('Total exceeds safe integer range');totals[key]=n;}
 }
 return {currency,claims,findings,provisionalTotals:totals,totalsComplete:findings.every(f=>f.reason==='duplicate_snapshot'),status:'needs_review'};
}
