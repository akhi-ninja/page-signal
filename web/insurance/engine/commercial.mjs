import { createSubmission } from './index.mjs';

const common = [
  { key: 'namedInsured', aliases: ['Named insured','Applicant name','Name of applicant'], required: true },
  { key: 'effectiveDate', aliases: ['Effective date','Proposed effective date'], required: true },
  { key: 'businessDescription', aliases: ['Business description','Description of operations'], required: true },
  { key: 'mailingAddress', aliases: ['Mailing address'], required: false }
];
const specific = {
  'commercial-property': [{key:'propertyAddress',aliases:['Property address','Location address'],required:true}],
  'general-liability': [{key:'annualRevenue',aliases:['Annual revenue','Annual gross sales'],required:true}],
  'commercial-auto': [{key:'fleetSize',aliases:['Fleet size','Number of vehicles'],required:true}],
  'workers-compensation': [{key:'annualPayroll',aliases:['Annual payroll','Estimated annual payroll'],required:true}]
};
const normalize = s => s.trim().toLowerCase().replace(/\s+/g,' ');
export function commercialProfile(lineOfBusiness) {
  if (!Object.hasOwn(specific,lineOfBusiness)) throw new RangeError('Unsupported commercial line');
  return {version:'1.0',lineOfBusiness,fields:structuredClone([...common,...specific[lineOfBusiness]])};
}
export function prepareCommercialSubmission(input, profile = commercialProfile(input.lineOfBusiness)) {
  if (profile.lineOfBusiness !== input.lineOfBusiness || typeof profile.version !== 'string' || !Array.isArray(profile.fields)) throw new TypeError('Invalid profile');
  const submission = createSubmission(input);
  const fields = Object.create(null), findings = [], keys = new Set(), aliases = new Set();
  for (const rule of profile.fields) {
    if (typeof rule.key !== 'string' || !rule.key.trim() || keys.has(rule.key) || typeof rule.required !== 'boolean' || !Array.isArray(rule.aliases) || !rule.aliases.length || rule.aliases.some(a=>typeof a !== 'string' || !a.trim())) throw new TypeError('Invalid field rule');
    keys.add(rule.key);
    const labels = new Set(rule.aliases.map(normalize));
    for (const label of labels) { if (aliases.has(label)) throw new TypeError('Ambiguous field mapping'); aliases.add(label); }
    const sources = submission.evidence.filter(e=>labels.has(normalize(e.label)));
    const values = [...new Set(sources.map(e=>e.value.trim()))];
    const reason = values.length > 1 ? 'conflict' : !values.length ? (rule.required ? 'missing' : null) : sources.every(e=>!e.excerpt?.trim()) ? 'missing_evidence' : null;
    fields[rule.key] = {value: values.length === 1 ? values[0] : null, sources};
    if (reason) findings.push({field:rule.key,reason});
  }
  return {...submission,profileVersion:profile.version,fields,findings,status:'needs_review'};
}
