# Native integration quality — issue #25

Source milestone validated November 23, 2026. This is not an npm release, a hosted deployment or a formal WCAG certification.

## Delivered

- Shared opt-in `@pagesignal/sdk/preview` controller across React, Vue and Angular: page navigation with host renderers, bounded zoom, fit width, source-page navigation and normalized evidence overlays. PDF native fallback explains its limitations.
- Renderer abort/cleanup, document-switch stale-result protection and no module-time DOM requirement. Heavy PDF/OCR runtimes are not dependencies of the UI packages.
- Headless workspace/preview APIs, current result/source callbacks, CSS color variables, React renderField, Vue field slot and Angular fieldTemplate extension points. Existing optional-page source objects remain type-compatible.
- Runnable local examples for all frameworks with lazy host-owned PDF.js page rendering, bounded image/PDF extraction, server-only credentials, exact origin/payload checks and explicit local-only hosting boundaries. Image/PDF examples build without contacting OpenAI; real extraction remains opt-in and paid. Query adapter is intentionally not included.
- CI matrix packs/install tests for React 18.3.1/19.2.4, Vue 3.5.45, Angular 21.2.26, RxJS 7.8.2 on Node 24. SSR imports, strict TypeScript exports and native framework mounts are verified outside workspace symlinks.
- Accessibility DOM audits (axe WCAG 2 A/AA rules with jsdom-incompatible color-contrast rule excluded), keyboard focus via user-event, native labeled controls, status announcements, bounded navigation, and custom field tests. Default text/accent contrast checked separately against 4.5:1. Layout uses wrapping controls/review columns, max-width inputs and wrapping JSON; host themes and custom field content require application testing.

## Validation

101 repository tests pass, Angular package builds, all three Vite examples build, docs/release/package checks pass and git diff has no whitespace errors. Packed consumers are checked with both supported React majors and corresponding React type majors. No provider credentials or paid model calls are required for these checks.

Minified ESM bundles measured with esbuild 0.27.7 (framework peers, PDF/OCR renderers excluded):

| UI | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| React | 11,390 | 4,760 |
| Vue | 11,756 | 4,914 |
| Angular | 17,791 | 5,839 |

The 50KB raw CI review budget is a packaging guard, not an accuracy or browser-performance promise. Example full-app builds additionally include framework dependencies; the Angular demo includes its JIT compiler. Optional PDF chunks/worker are lazy and substantially larger, outside these figures. Use your normal AOT Angular build in production.

## Limits and release follow-up

No live provider extraction, visual browser/device test or real screen-reader session was performed in this milestone. Automated semantic/keyboard tests do not establish complete assistive-technology interoperability. Evidence boxes are supplied by the host; bounds checking does not prove source accuracy. Default native PDF embedding depends on browser support; use the included optional host renderer or another application renderer for consistent PDF pages/overlays.

No source API requires new secrets. Existing imports/default preview remain compatible; enable enhancedPreview explicitly. Keep adapters/config stable as documented. Repository source is ahead of registry 2.0.0: versioning, npm publication and website production deployment are separate release actions. See examples/native/README.md for setup, contracts, migration and lifecycle details.
