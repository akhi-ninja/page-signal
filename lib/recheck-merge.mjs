import { verifyFields } from '../web/document-quality.mjs';
const key = f => JSON.stringify([f.section ?? null, f.label]);
// Never match repeated labels by guessed occurrence order across model calls.
function unique(fields) {
 const map = new Map();
 for (const field of fields) { const id = key(field); map.set(id, map.has(id) ? null : field); }
 return map;
}
/** Conservative transcript-grounded merge, not an independent visual verifier. */
export function mergeRecheck(original, candidate, text) {
 const merged = structuredClone(original);
 const rejected = [];
 if (original.document_type !== candidate.document_type || original.form_number !== candidate.form_number) {
  return { result: merged, rejected: ['recheck_document_identity_conflict'] };
 }
 const previous = verifyFields(original, text), next = unique(verifyFields(candidate, text));
 const identities = unique(previous);
 merged.fields = previous.map((field, index) => {
  const replacement = next.get(key(field));
  const base = original.fields[index];
  if (!replacement) return base;
  const changed = base.value !== replacement.value || base.state !== replacement.state;
  if (!identities.get(key(field))) { if (changed) rejected.push('recheck_ambiguous_field'); return base; }
  if (field.verification.status === 'transcript_match' || field.reviewed || field.state === 'blank' || ['checked','unchecked'].includes(field.state)) {
   if (changed) rejected.push('recheck_established_field_conflict');
   return base;
  }
  if (replacement.verification.status !== 'transcript_match') {
   if (changed) rejected.push('recheck_unsupported_correction');
   return base;
  }
  const { verification, ...accepted } = replacement;
  return accepted;
 });
 if (JSON.stringify(original.tables) !== JSON.stringify(candidate.tables)) rejected.push('recheck_table_change_requires_review');
 if (candidate.fields.some(f => !identities.has(key(f)))) rejected.push('recheck_new_field_requires_review');
 // A classification status may improve only for the same document identity.
 if (!rejected.length && candidate.classification_status === 'identified') merged.classification_status = 'identified';
 return { result: merged, rejected: [...new Set(rejected)] };
}
