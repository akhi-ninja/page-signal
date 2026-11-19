# Changelog

## 2.0.0

- Add native Angular 21 and Vue 3.5 document workspace packages.
- Replace the React iframe wrapper with a native DOM workspace (breaking API change).
- Share browser-safe validation, parallel queue, cancellation, field editing, queries and JSON export through SDK workspace subpath.
- Provide image/PDF browser previews and host-owned extraction/query adapters, without exposing service or provider secrets.
- Add Angular partial-compilation build, framework mount tests, and five-package packaging/release support.
- Initial native components do not bundle OCR, PDF rasterization, precise source overlays, account infrastructure or the full hosted application's controls.

## 1.1.1

### npm packages

- Publish synchronized `@pagesignal/core`, `@pagesignal/sdk`, and `@pagesignal/react` versions.
- Add `queryDocument` to core and SDK for text-based field lookup and follow-up document chat, with source citations and atomic field values.
- Include the updated extraction engine with open-vocabulary document identification, form/title/issuer extraction, field states, tables, and conservative handling of unreadable values.
- Reject unsupported field values and guessed/malformed email results; support numeric values backed by formatted source amounts.
- Update documentation, canonical website links, and GitHub Sponsors metadata.
- Keep React as a same-origin iframe wrapper; deploy the source application to use its workspace features.

### Full source application

- Multi-file upload and drag-and-drop with per-file, per-batch and PDF-page limits.
- Parallel document processing, queue progress graphics, and AI batch extraction.
- Full-width fields-left/document-right review with PDF/image preview, page navigation, zoom and source highlighting where reliable positions exist.
- Specific-field extraction, document chat and structured JSON export.
- GitHub account sign-in, server-side AI authorization and request quotas.
- Optional private community registration with consent, contact permission and withdrawal.
- Allowlisted maintainer dashboard for registered accounts and hosted AI request attempts.
- PageSignal branding, studio domain links, usage documentation, SEO metadata, structured data and sitemap.

AI output still requires source review. Queries use supplied text, and scans may require vision extraction. The npm packages do not bundle hosted account infrastructure or the complete browser application; those are available in the GitHub source release. Existing npm installations do not update automatically.

## 0.1.0

### Initial npm release

- Introduce `@pagesignal/core` for server-side document extraction using an OpenAI credential.
- Introduce `@pagesignal/sdk` for calling a self-hosted PageSignal service from Node.js.
- Introduce `@pagesignal/react` as a same-origin iframe wrapper for the deployed workspace.
- Publish the initial three packages under the MIT license.

This version was published to npm on November 17, 2026. It did not have a corresponding GitHub release. npm staging placeholders are not product releases.
