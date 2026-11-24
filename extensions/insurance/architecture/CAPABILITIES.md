# Domain capability matrix
All entries are targets unless explicitly marked foundation. Customer-specific requirements and jurisdictions must be validated.

| Domain | Required capabilities | Priority |
|---|---|---|
| Intake | Email/portal/API, attachment grouping, deduplication, assignment, SLA, broker correspondence | P0 |
| Documents | ACORD revision profiles, loss runs, SOV, schedules, OCR evidence, confidence, missing/conflicting values | P0 |
| Accounts | Insured entities, producer/broker, account clearance, existing policy lookup, authorized enrichment | P0 |
| Commercial property | Locations/buildings, construction/occupancy/protection/exposure, values, business interruption, catastrophe adapters | P0 |
| General liability | Operations, class codes, revenue, premises, limits, exclusions | P0 |
| Commercial auto | Vehicles, drivers, garaging, use, fleet, loss history | P0 |
| Workers compensation | Jurisdiction, payroll, classifications, experience modifiers | P0 |
| BOP/package | Coverage parts, shared account, product eligibility, cross-coverage validation | P1 |
| Underwriting | Appetite, triage, risk summary, authority, referrals, approval, notes, collaboration | P0 |
| Products/rating | Versioned products, coverage/forms, rate adapters, taxes/fees, effective dates, scenario testing | P1 |
| Distribution | Broker portal, carrier appetite, comparative quote, revisions, negotiation, bind/issue handoff | P1 |
| Servicing | Renewals, endorsements, cancellations, policy history, billing integration | P2 |
| Portfolio | Exposure accumulation, concentration, loss ratio with defined data basis, capacity and reporting | P2 |
| Claims | FNOL, document intake, triage, claims-system handoff | P3 |
| Specialty/reinsurance | Delegated authority, bordereaux, treaty/facultative adapters, specialty exposures | P3 |
| Governance | Tenant isolation, RBAC, audit, retention, consent/legal basis, evaluation, model provenance, accessibility | P0 cross-cutting |
| Configuration | Schema, workflow, rules, product and provider configuration, versioning and rollback | P1 |
 
Foundation today: generic evidence adapter, four starter commercial profiles, draft risk record, ACORD marker/revision candidates. No production-grade line-specific schemas, rating, binding or regulated decisions yet.
