# PageSignal Chrome extension — development pilot

Tracks [issue #46](https://github.com/akhi-ninja/page-signal/issues/46). This is an initial local staging shell, **not a released extraction client**.

Load this directory through `chrome://extensions` → Developer mode → Load unpacked (Chrome 116+). Click the extension icon to open its native side panel. Choose/drop one supported PDF/image up to 30 MiB, preview an image, or select webpage text and use the context menu. Review/edit text and export explicitly marked `not_extracted` staging JSON. Clear removes staged text from session storage. File bytes are never stored in extension storage. Closing the panel discards its file metadata and preview; selected text remains in session storage until Clear or browser session ends.

No build, remote scripts, iframe, host permissions, network requests, cookies, API keys or AI calls are used in this first milestone. No page is read automatically. The storage permission is for temporary selected text only. Browser context menus may be unavailable on some restricted surfaces.

Remaining acceptance work before release:

- Bundle PDF.js and its worker; enforce PDF page count and rendered request sizes.
- Add secure explicit website account pairing, allowlisted extension origins, short-lived scoped token validation, session revocation checks and existing account quotas.
- Connect extraction, editable field review, targeted questions and final extraction JSON.
- Add explicit screenshot region capture with user-gesture permission handling.
- Chrome manual accessibility/capture/session tests and Chrome Web Store listing/privacy disclosures.

Do not submit this pilot to the Web Store as a completed AI extension. Do not weaken the existing API's origin checks to connect it.
