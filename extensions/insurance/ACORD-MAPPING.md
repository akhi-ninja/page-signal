# Revision-aware ACORD mapping (PS-04)

Use `mapAcordSubmission(input, profiles)` from `@pagesignal/insurance/acord-mapping` with existing PageSignal page results. Each page supplies `text` (OCR text), `result.fields`, and a reviewer-confirmed `confirmedForm: {formNumber, revision}`. Confirmation must be supplied by a trusted application workflow; the library does not authenticate reviewers.

Profiles are adopter-supplied, exact revision configurations with formNumber, revision (YYYY-MM), version and fields (canonical key and aliases). Only confirmed, recognized pages with matching profiles contribute to canonical fields. Unknown or ambiguous pages remain review findings. Conflicting values are not resolved automatically. Evidence excerpts are retained, not independently verified.

Synthetic tests use invented labels, not licensed ACORD templates. Obtain appropriate rights and validate real revision mappings before production use. No real document upload, authentication, persistence or AI calls are introduced. PS-09/28 remain gates for customer data. Multi-page continuation recognition and authorized mapping benchmarks remain future work.
