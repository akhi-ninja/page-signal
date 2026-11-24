# Insurance preview acceptance tests

Use synthetic data only. Open Insurance Preview > ACORD Intelligence or Loss Runs. Select each scenario, download test input, import the same JSON, and verify the findings and totals match. Change a field and rerun validation. Importing another module's fixture, invalid JSON or a file larger than 256 KB must be rejected without replacing current input. No network upload is used. Synthetic markers are a format convention, not a privacy classifier.

ACORD: confirmed revision maps four fields; unknown revision and unconfirmed form do not map; conflicting insured values produce a conflict. Loss: historical valuation totals USD 45,000 incurred; duplicate snapshot totals USD 50,000; conflicting snapshot and incorrect incurred exclude affected claims. Inspect evidence and download normalized result. Confirm home extraction and existing navigation work.

Fixtures contain normalized synthetic data, not original PDFs or licensed ACORD layouts. PDF extraction and tenant-secure storage remain gated.
