import { identifyAcordPages, selectAcordProfile } from './acord.mjs';
import { createSubmission } from './index.mjs';
import { commercialProfile } from './commercial.mjs';

const norm = s => s.trim().toLowerCase().replace(/\s+/g,' ');
const nonempty = s => typeof s === 'string' && !!s.trim();

// Profiles are supplied by the adopter; no licensed forms or mappings are bundled.
export function mapAcordSubmission(input, profiles, commercial = commercialProfile(input.lineOfBusiness)) {
  const submission = createSubmission(input);
  if (!Array.isArray(profiles) || commercial.lineOfBusiness !== input.lineOfBusiness || !Array.isArray(commercial.fields)) throw new TypeError('Invalid profiles');
  const keys = new Set();
  for (const rule of commercial.fields) {
    if (!nonempty(rule.key) || keys.has(rule.key) || typeof rule.required !== 'boolean') throw new TypeError('Invalid target field');
    keys.add(rule.key);
  }
  const revisions = new Set();
  for (const p of profiles) {
    if (!p || !/^\d{1,3}$/.test(p.formNumber) || typeof p.formNumber !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.revision) || !nonempty(p.version) || !Array.isArray(p.fields)) throw new TypeError('Invalid revision profile');
    const id = p.formNumber + ':' + p.revision;
    if (revisions.has(id)) throw new TypeError('Duplicate revision profile');
    revisions.add(id);
    const labels = new Set();
    for (const rule of p.fields) {
      if (!keys.has(rule.key) || !Array.isArray(rule.aliases) || !rule.aliases.length || rule.aliases.some(a=>!nonempty(a))) throw new TypeError('Invalid mapping rule');
      for (const alias of new Set(rule.aliases.map(norm))) {
        if (labels.has(alias)) throw new TypeError('Ambiguous mapping alias');
        labels.add(alias);
      }
    }
  }
  const fields = Object.fromEntries([...keys].map(key=>[key,{value:null,sources:[]}]));
  const findings = [], pages = [];
  for (const doc of input.documents) {
    for (const page of doc.pages) {
      const identification = identifyAcordPages([{page:page.page,text:page.text ?? ''}])[0];
      const profile = selectAcordProfile(identification, profiles);
      const confirmed = page.confirmedForm?.formNumber === identification.formNumber && page.confirmedForm?.revision === identification.revision;
      const state = identification.status !== 'candidate' ? identification.status : !profile ? 'profile_missing' : !confirmed ? 'confirmation_required' : 'mapped';
      pages.push({documentId:doc.id,...identification,mappingStatus:state,profileVersion:profile?.version??null});
      if (state !== 'mapped') {
        findings.push({documentId:doc.id,page:page.page,reason:state});
        continue;
      }
      const evidence = submission.evidence.filter(e=>e.documentId===doc.id && e.page===page.page);
      for (const rule of profile.fields) {
        const aliases = new Set(rule.aliases.map(norm));
        for (const e of evidence.filter(e=>aliases.has(norm(e.label)))) {
          fields[rule.key].sources.push({...e,formNumber:profile.formNumber,revision:profile.revision,mappingVersion:profile.version});
        }
      }
    }
  }
  for (const rule of commercial.fields) {
    const field = fields[rule.key];
    const values = [...new Set(field.sources.map(e=>e.value.trim()))];
    if (values.length === 1) field.value = values[0];
    if (values.length > 1) findings.push({field:rule.key,reason:'conflict'});
    else if (!values.length && rule.required) findings.push({field:rule.key,reason:'missing'});
    if (field.sources.some(e=>!nonempty(e.excerpt))) findings.push({field:rule.key,reason:'missing_evidence'});
  }
  return {...submission,profileVersion:commercial.version,pages,fields,findings,status:'needs_review'};
}
