# Insurance workspace integration (proposed)
Keep the current document extraction workspace and routes unchanged. Add an Insurance navigation entry linking to a separate /insurance/ workspace. Reuse the existing violet palette, upload queue, extraction API, field review and source preview components. Do not expose provider keys in the browser.
 
1. Submission inbox: create submission, choose commercial line, assign reference and broker; list status and missing items.
2. Upload documents: group multiple files under submission; reuse existing extraction jobs, show per-document progress and failures.
3. Document review: classify ACORD candidates and revisions, allow human confirmation, unknown forms remain unclassified. Left document queue, center editable extracted fields, right existing PDF source preview. Show evidence and page links.
4. Submission review: consolidate fields across documents, show missing values and conflicting candidates; require explicit human resolution with audit history.
5. Risk summary: display draft account, locations, coverages and exposures. No automatic underwriting or binding.
6. Export: download normalized submission JSON and findings; later add authorized API integrations.
 
Initial UI should be a separate opt-in workspace, with synthetic demo data clearly labeled. Production persistence, authorization, tenant isolation, audit storage and integration with the current upload lifecycle must be implemented and tested before enabling real submissions. Existing extraction result contracts remain unchanged.
 
ACORD identification is a conservative text-marker heuristic, not verified form recognition. Customer-provided authorized revision profiles are selected only by exact match. No licensed forms or official field definitions are included. Cross-document review uses the existing commercial normalization module; revision-specific mapping orchestration remains future work.
