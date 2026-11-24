// Independent insurance submission foundation. No network or persistence.
export function createSubmission({ id, lineOfBusiness, documents }) {
  if (typeof id !== 'string' || !id.trim() || typeof lineOfBusiness !== 'string' || !lineOfBusiness.trim() || !Array.isArray(documents)) throw new TypeError('Invalid submission');
  const seen = new Set();
  const evidence = [];
  for (const doc of documents) {
    if (!doc || typeof doc.id !== 'string' || !doc.id.trim() || seen.has(doc.id) || !Array.isArray(doc.pages)) throw new TypeError('Invalid or duplicate document');
    seen.add(doc.id);
    const pages = new Set();
    for (const page of doc.pages) {
      if (!Number.isSafeInteger(page.page) || page.page < 1 || pages.has(page.page) || !Array.isArray(page.result?.fields)) throw new TypeError('Invalid or duplicate page');
      pages.add(page.page);
      for (const field of page.result.fields) {
        if (typeof field.label !== 'string') throw new TypeError('Invalid field label');
        if (field.state !== 'filled' || typeof field.value !== 'string' || !field.value.trim()) continue;
        evidence.push({ documentId: doc.id, page: page.page, label: field.label, value: field.value, excerpt: typeof field.evidence === 'string' ? field.evidence : null });
      }
    }
  }
  return { id, lineOfBusiness, documentIds: [...seen], evidence, status: 'needs_review' };
}

export function validateSubmission(submission, requiredFields) {
  if (!Array.isArray(requiredFields) || requiredFields.some(x => typeof x !== 'string' || !x.trim())) throw new TypeError('Invalid required fields');
  const findings = [...new Set(requiredFields)].flatMap(label => {
    const candidates = submission.evidence.filter(e => e.label.trim().toLowerCase() === label.trim().toLowerCase());
    const values = [...new Set(candidates.map(e => e.value.trim()))];
    return values.length === 0 ? [{ label, reason: 'missing' }] : values.length > 1 ? [{ label, reason: 'conflict', candidates }] : candidates.every(e => !e.excerpt?.trim()) ? [{ label, reason: 'missing_evidence', candidates }] : [];
  });
  return { submissionId: submission.id, findings, status: 'needs_review' };
}
