# Commercial domain foundation

Experimental version 1.0 risk record: account, submission reference, line of business, policy period, currency, locations and coverage terms. Monetary values are integer minor units in a single caller-selected currency; the currency format check does not validate ISO membership or currency precision. Coverage location references must exist. Records are drafts, not policies, quotes or eligibility decisions. Customers must supply approved data and validate product-specific terms. No persistence or network calls. Future models include broker/carrier relationships, loss events, exposure schedules, referrals, authority and policy transactions.

Import createCommercialRiskRecord from @pagesignal/insurance/domain after local installation. Run node --test extensions/insurance/*.test.mjs.
