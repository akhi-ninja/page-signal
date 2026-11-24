# PageSignal search launch and editorial links

## Adopted on the current development baseline

- Public, server-delivered guide index, PDF-to-JSON tutorial and package integration guide. These do not require a login and are linked from the homepage and repository README. Package README edits from the original PR are intentionally excluded to avoid stale overwrites.
- Unique titles/descriptions, canonical URLs, social metadata and content-matching structured data. No invented ratings, reviews, accuracy percentages or pricing.
- Sitemap entries and deployment routes for all three new pages; public crawl access is preserved. Account, community and admin views remain noindex.
- Descriptive GitHub → website links for the new guides. This change does not publish npm versions.

## Verify Google ownership and indexing

1. Open https://search.google.com/search-console and add a Domain property for `pagesignal.studio`, or URL-prefix property for `https://www.pagesignal.studio/`.
2. Domain verification requires the exact DNS TXT record Google supplies. URL-prefix verification can use the provided HTML meta tag/file or an eligible Google Tag Manager verification method. Use the Google account authorized for the property. GTM installation alone is not proof that verification or sitemap submission happened.
3. If code-based verification is selected, provide only the public verification token/file, never a Google password or OAuth token. Add the exact supplied value; do not invent it.
4. Submit `https://www.pagesignal.studio/sitemap.xml` under Sitemaps.
5. Inspect the homepage, `/guides/pdf-to-json` and `/integrations`, run Test live URL, then Request indexing if eligible.
6. Monitor Page indexing, Crawl stats and Performance. Crawl requests and sitemap submission do not guarantee indexing or rankings. A public search query with no results is not an authoritative index-status report.

Reference: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl

## Backlink and referral checklist

These are editorial opportunities, not completed submissions or guaranteed backlinks. Follow each community's rules and disclose that you maintain PageSignal. Prefer useful working examples over repetitive promotional links. Do not buy bulk links, fake reviews or reciprocal link schemes. Third-party links may be nofollow and may not be counted by backlink crawlers.

- [ ] Vue Show and Tell: https://github.com/vuejs/core/discussions/categories/show-and-tell — share a native Vue integration example with source, npm and the integration guide.
- [ ] Made with Vue: https://madewithvuejs.com/submit — submit a Vue component demo for editorial consideration; check current submission terms.
- [ ] Awesome Angular: https://github.com/PatrickJS/awesome-angular — propose a concise relevant directory entry by PR after reviewing contributing.md and checking for duplicates.
- [ ] Awesome Vue: https://github.com/vuejs/awesome-vue — check current maturity/category criteria before proposing a listing.
- [ ] DEV Community: publish an original tutorial with a runnable adapter example and a contextual source link. Vue community resources: https://vuejs.org/about/community-guide.html.
- [ ] LinkedIn article: publish the prepared founder article and link to the PDF-to-JSON guide. Link visibility and search treatment are controlled by LinkedIn.
- [ ] GitHub repository About website: ensure it points to https://www.pagesignal.studio/ and the repository description clearly says open-source document extraction.
- [ ] npm package homepages: confirm published metadata points to the website/documentation when the next package release is made.

### Suggested submission copy

Title: PageSignal — native Vue 3 document review and JSON export

I maintain PageSignal, an open-source document extraction project. The Vue component provides multi-file upload, a processing queue, editable extracted fields, source preview, query controls and JSON export. It renders native Vue DOM and uses an application-provided backend adapter; it does not bundle OCR or model credentials. The integration guide explains the package boundaries and links to runnable API examples: https://www.pagesignal.studio/integrations. Source: https://github.com/akhi-ninja/page-signal. Feedback on the adapter API and review workflow is welcome.

For Angular, adapt the title and example to the supported Angular version; do not imply support for untested framework releases.

## Track actual outcomes

Record each submitted URL, submission date, review state, published link and referral traffic. Mark submissions pending until publicly accepted. Search Console Links and third-party backlink crawlers are incomplete and update on their own schedules. Analytics traffic, npm download counts and backlink counts are different metrics.
