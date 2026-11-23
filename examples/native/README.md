# Runnable native examples

These examples use the repository source packages (not the older published 2.0.0 tarballs). Node 24 is recommended. Run from the repository root:

```
npm ci --ignore-scripts
npm run build:packages
```

In terminal 1 set `OPENAI_API_KEY` in your local environment and run `node examples/native/server.mjs`. Never add the key to frontend variables, source files, URLs or Git. In terminal 2:

```
FRAMEWORK=react npx vite --config examples/native/vite.config.mjs
```

Choose `vue` or `angular` in place of `react`. Open the localhost URL printed by Vite. Upload a nonempty PDF or PNG/JPEG/WebP/BMP; edit returned fields, use JSON export and test removal/cancellation. Real extraction uses your provider quota and costs money. There is no paid request on startup. No mock results are presented as AI extraction.

The example includes a working, host-owned lazy PDF.js renderer (`pdf-renderer.mjs`) and sequential page extraction adapter. It allows 30 MiB files and 40 PDF pages; every PDF page makes one paid extraction request. It returns per-page results and flattened fields with page/excerpt evidence; it does not invent boxes or reconcile distinct documents. A failure stops the minimal example; use the richer headless controller/host service for partial-page recovery. PDF.js is an example dev dependency only, excluded from the published UI packages. Replace it with your own renderer if your application already has one. Queries are not configured in this minimal example. Native package features differ from hosted PageSignal services; there is no automatic access to hosted sign-in, quotas, OCR or LangGraph.

The server binds only to 127.0.0.1, enforces the configured exact browser Origin (default http://localhost:5173), JSON type, streamed 4MB payload limit, JPEG input and concurrency 2. It deliberately has no public authentication endpoint. **Do not deploy this demo server publicly**; use the authenticated hosted integration or add verified sessions and persistent per-user/global quotas. Configure `EXAMPLE_ORIGIN` if you change the frontend origin.

## Optional page preview adapter

Set `enhancedPreview` in any framework. Images support zoom, fit width and evidence overlays without dependencies. PDFs fall back to the browser viewer unless a `previewRenderer` is supplied. Native PDF viewer internals do not offer reliable overlays or page counting to the package; those controls require a renderer.

```
const previewRenderer = {
  async getPageCount({file, signal}) { /* load through your PDF library */ return 3; },
  async renderPage({file, page, container, signal}) {
    // Render exactly one upright page to a canvas/image inside container.
    // Respect signal; release PDF resources and listeners on cancellation.
    // Do not add padding, rotate, or place extra UI inside this surface.
  }
};
```

This is the renderer contract, not a bundled PDF implementation. Load PDF.js or another renderer in your host only when needed. Do not pass untrusted HTML to a renderer. `source` is `{page: 1, excerpt: 'verbatim source', box: {x: .1, y: .2, width: .3, height: .05}}`. Page numbers start at 1. Boxes use normalized upright-page coordinates with top-left origin. Correct rotation/preprocessing coordinates in your adapter. Only provide a box for a reliably located value; label-only/OCR guesses should supply a page/excerpt without a box. The package validates bounds but cannot verify evidence truth.

## Customization and lifecycle

React: `className`, `onResultsChange`, `onSourceNavigate`, `renderField({field,index,document,update,showSource})` (return a labeled React node).

Vue: normal class/style fallthrough, `resultsChange` event, `onSourceNavigate` callback and scoped `field` slot with the same context as React.

Angular: style the host, subscribe to `resultsChange`/`sourceNavigate`, and supply `fieldTemplate: TemplateRef` with `$implicit` field, `index`, `document`, `controller`. Use `controller.updateField(document.id,index,value)` to preserve edits. Use component `showSource(field.source)` for source navigation.

The browser-safe `@pagesignal/sdk/workspace` controller is the headless API; `@pagesignal/sdk/preview` exports `mountPreview` for custom UIs. Dispose both on unmount. Theme preview with `--pagesignal-color`, `--pagesignal-background`, `--pagesignal-accent`; use host CSS for the rest of the native form, including visible focus rings. Keep label/input associations and keyboard behavior in custom field renderers.

Keep React adapter/config/renderer references stable: changing them recreates workspace (adapter/config) or preview (renderer). Vue/Angular adapters are dereferenced on each action; maxFiles/concurrency are initialization options, so remount to change those settings. Renderer changes recreate preview. Switching/removing documents and unmounting abort render work; late results are ignored. The shared controller cancels extraction/query and revokes preview URLs. A custom renderer must clean up its own resources when its signal aborts. Avoid regenerating renderers on every state update.

## Compatibility and quality

CI installs packed SDK/React/Vue/Angular tarballs in a clean consumer with React 18.3.1 and 19.2.4, Vue 3.5.45, Angular 21.2.26 and RxJS 7.8.2 on Node 24. Peers have not been widened; exact patch matrix is evidence, not a claim every possible peer combination is tested. The consumer verifies server-side imports without DOM (Angular compiler loaded for partial compilation), headless lifecycle and strict TypeScript export resolution.

`node scripts/native-bundle-report.mjs` bundles/minifies each UI plus SDK with esbuild, excludes framework peers, reports raw/gzip bytes and fails above a 50KB raw review budget. This budget is a packaging guard, not a performance or accuracy guarantee. PDF/OCR libraries, authentication and LangGraph must not appear in these bundles. Supported browser baseline: modern browsers with File, object URLs, AbortController and native ES modules; browser PDF embedding support varies, so provide a renderer or use Open PDF fallback.

Automated DOM tests cover labels, status announcements, focusable native controls, disabled bounds, evidence focus, cancellation, stale work and all three framework mounts. Real assistive-technology/browser/device testing remains a release verification step; no formal WCAG conformance certification is claimed. Default text #201a43 on white and purple #6630ce on white exceed 4.5:1; host themes/custom templates need their own contrast verification.

These are additive source changes for the next package release. Existing imports and the default native PDF/image preview remain available. Enable enhanced preview explicitly; no new service credentials or migration of saved results are required. This work does not publish or overwrite npm 2.0.0.

Angular example builds include the JIT compiler for simplicity; use normal Angular AOT application tooling for a smaller production application. The example full-app bundle includes framework/PDF assets and is not the package-only size measurement.
