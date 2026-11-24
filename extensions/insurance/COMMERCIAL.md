# Commercial submission intelligence

Experimental starter profiles for commercial property, general liability, commercial auto and workers compensation. These are illustrative minimum field mappings, not complete ACORD schemas or carrier eligibility criteria. Customers supply versioned profiles with field aliases and required flags. The module maps existing extraction evidence without calling AI, reports missing and conflicting values, and always requires human review. It does not infer dates, monetary amounts, eligibility or coverage. Repeated risk locations and schedules need separate structured models in a subsequent release.

Import `prepareCommercialSubmission` from `@pagesignal/insurance/commercial` after local installation. Input follows the existing insurance extension contract. Run `node --test extensions/insurance/*.test.mjs` from repository root.
