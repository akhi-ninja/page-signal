# PageSignal Insurance (experimental)

An opt-in, standalone MIT-licensed foundation for insurance submission workflows. This extension is deliberately outside the existing npm workspace glob to avoid changing the root lockfile, builds or releases. No existing routes, database, authentication or packages are modified.

Run `node --test extensions/insurance/index.test.mjs` from the repository root. Install locally with `npm install /path/to/page-signal/extensions/insurance` (not yet published).

Pass existing PageSignal page extraction responses as `documents: [{id, pages: [{page, result}]}]` to `createSubmission({id,lineOfBusiness,documents})`. Use `validateSubmission(submission, requiredFields)` for exact-label completeness and conflict checks. Evidence is carried through, not independently verified. All submissions require human review; no eligibility, pricing or binding decisions are made.

Next: versioned domain schemas, field mapping, loss runs, SOV, clearance, appetite rules, independent API and UI adapters. Commercial P&C first; personal auto and health remain separate bounded contexts. No production deployment until regression and security checks pass.
