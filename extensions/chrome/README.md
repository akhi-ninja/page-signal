# PageSignal Chrome extension

Version 0.2.0 lets users select a PDF, image, or webpage text, start extraction, review the returned fields, and export JSON in the Chrome side panel. PDFs are rendered locally using bundled PDF.js. Pressing **Extract in side panel** sends the selected content to PageSignal’s authenticated AI API. Results stay in the active side panel until cleared or closed. A multi-page file uses one extraction request per page, with the same usage limits as the web workspace.

## Build and try it

Use Node.js 24 and run `npm ci --ignore-scripts`, then `node extensions/chrome/build.mjs` from the repository root. Load `dist/chrome-extension` via **Load unpacked** in `chrome://extensions`. Zip the contents of that directory for the Chrome Web Store.

The production API deployment needs `PAGESIGNAL_CHROME_EXTENSION_ORIGIN` set to `chrome-extension://<published-extension-id>`. The ID must be the 32-character ID on the existing Chrome Web Store item. A separately loaded unpacked build may have a different ID. To test that build against an isolated PageSignal deployment, configure that deployment for the unpacked ID and point both the extension host permission and the panel's site constant at that deployment. Keep the production allowlist limited to the published ID.

Users sign in through the existing PageSignal website once and return to the panel. A valid PageSignal browser session is reused without storing credentials in extension storage. If the browser blocks cookies on extension requests, allow PageSignal cookies, then select **Check sign-in**. Expired or revoked sessions require signing in again.

## Release checks

Deploy the API and configure the published origin before releasing the updated extension. Update the Web Store listing and privacy disclosures to describe the PageSignal host permission, account session use, and processing of user-selected documents and text. In the installed extension, verify session reuse, sign-in expiry, image and multi-page PDF extraction, partial exports, and quota handling using synthetic documents.
