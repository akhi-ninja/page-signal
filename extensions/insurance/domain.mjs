// Versioned, provider-independent commercial insurance domain contracts.
const required = (v, name) => { if (typeof v !== 'string' || !v.trim()) throw new TypeError(name+' is required'); return v.trim(); };
const date = (v,name) => { required(v,name); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v) throw new TypeError('Invalid '+name); return v; };
const money = (v,currency) => { if (!Number.isSafeInteger(v)||v<0) throw new TypeError('Amount must be nonnegative integer minor units'); return {minorUnits:v,currency}; };
const unique = (items,name) => { if(new Set(items.map(x=>x.id)).size!==items.length) throw new TypeError('Duplicate '+name); return items; };
export function createCommercialRiskRecord(input) {
 const currency=required(input.currency,'currency'); if(!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Invalid currency format');
 const effectiveDate=date(input.effectiveDate,'effectiveDate'), expirationDate=date(input.expirationDate,'expirationDate');
 if(expirationDate<=effectiveDate) throw new RangeError('Invalid policy period');
 const account={id:required(input.account?.id,'account.id'),namedInsured:required(input.account?.namedInsured,'namedInsured')};
 if(!Array.isArray(input.locations)||!Array.isArray(input.coverages)) throw new TypeError('Locations and coverages must be arrays');
 const locations=unique(input.locations.map(l=>({id:required(l.id,'location.id'),address:required(l.address,'location.address'),...(l.insuredValueMinorUnits==null?{}:{insuredValue:money(l.insuredValueMinorUnits,currency)})})),'location');
 const coverages=unique(input.coverages.map(c=>({id:required(c.id,'coverage.id'),code:required(c.code,'coverage.code'),limit:money(c.limitMinorUnits,currency),deductible:money(c.deductibleMinorUnits,currency),locationIds:[...new Set(c.locationIds??[])]})),'coverage');
 for(const c of coverages) for(const id of c.locationIds) if(!locations.some(l=>l.id===id)) throw new TypeError('Unknown coverage location');
 return {schemaVersion:'1.0',id:required(input.id,'id'),submissionId:required(input.submissionId,'submissionId'),lineOfBusiness:required(input.lineOfBusiness,'lineOfBusiness'),account,policyPeriod:{effectiveDate,expirationDate},currency,locations,coverages,status:'draft'};
}
