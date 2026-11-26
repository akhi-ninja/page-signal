# PageSignal Chrome extension

Version 0.2.1 fixes the previous website-cookie sign-in and 403 extraction failure when the production API did not recognize the installed extension's exact origin. The side panel renders PDFs locally with bundled PDF.js, then sends only explicitly selected document pages or text to PageSignal's account-scoped extraction API. Results remain in the side panel until cleared/closed.

## Mandatory production setup

**Before publishing the updated Web Store version**, configure the production Vercel project:

```
PAGESIGNAL_CHROME_EXTENSION_ORIGIN=chrome-extension://<32-letter-published-extension-ID>
```

Read the real ID from the **existing** Chrome Web Store listing or `chrome://extensions` (Developer mode). It is the 32-character lowercase ID made of `a`–`p`. Do **not** use the ID of a locally loaded unpacked copy. Do not allow `*`, comma-separated IDs, `http://` origins, website origin, or arbitrary extensions. Set the variable in **Production** for `page-signal` on Vercel and deploy the corresponding server code to production. A new Vercel production deployment is needed for the setting to take effect. Leave current customer-data and AI access controls enabled.

Without this setting the server intentionally denies extension authorization and extraction, even when the website session is valid. A successful website sign-in alone **does not** establish an extension connection.

## Account connection

1. Install the new version of the **existing** PageSignal Chrome Web Store item, then open the PageSignal side panel.
2. Choose **Connect PageSignal account**. The extension generates a random, five-minute pairing challenge and opens the canonical PageSignal website.
3. Sign in to PageSignal with GitHub/LinkedIn if necessary; return to the connection tab and select **Check sign-in**.
4. Review the requested access, then select **Approve & connect extension**. The website verifies your active, email-verified session and the configured extension ID. It sends a signed, extension-scoped capability through Chrome's `externally_connectable` channel; the background worker accepts it only if the pending challenge and website origin match.
5. Return to the panel: **Check connection** confirms the signed token and the active original session. Choose a PDF/image or selected text and select **Extract in side panel**.

The 15-minute access token is renewed using an extension-scoped, maximum seven-day refresh grant. Both types are signed, restricted to the one published extension ID, and validated against the live Better Auth PostgreSQL session. Signing out or revoking that session invalidates both tokens immediately; expired grants require reconnecting. No site session cookie, OAuth client secret, OpenAI key, or raw provider credentials are saved in extension storage. The only local storage is these limited-scope extension capabilities; clear by removing the extension (or clearing its extension storage).

## Build and release

From repository root, with the project's supported Node.js version:

```sh
npm ci --ignore-scripts
node extensions/chrome/build.mjs
```

Load `dist/chrome-extension` via `chrome://extensions` → **Load unpacked** for local testing. Local unpacked builds may have a different ID; use an isolated preview environment with an explicitly configured matching origin and separate login credentials for testing. Do not change production's allowlisted published ID to accommodate temporary local builds.

Zip the **contents** of `dist/chrome-extension` and upload a new package under the **existing Chrome Web Store item** (not a new listing). Chrome Web Store publication is a separate owner-controlled operation; publishing a GitHub PR or Vercel build does not update installed extensions.

## Required verification before publishing

- A website session alone does not unlock the extension; explicit website approval is required.
- Wrong extension IDs, an absent production allowlist, unverified accounts, expired/revoked login sessions and expired/tampered credentials fail closed.
- Following approval, **Check connection** shows a connected account and the extract button works on one synthetic image and a multi-page synthetic PDF.
- Verify extraction output, JSON export, 429 quotas, partial extraction errors, long-running cancel, and the session-refresh flow.
- Confirm no wildcard CORS, no remote extension scripts, no background collection and no auth cookies sent from extension fetches.
- Update Chrome Web Store permission justification and privacy disclosure for the exact PageSignal host access, website-to-extension pairing, and user-selected content sent for AI processing.

See `test/chrome-extension.test.mjs` and `test/chrome-extension-auth.test.mjs`. Unit tests cannot prove that production Web Store credentials, live sign-in, configured environment or actual Chrome store update work; those require manual production smoke tests.
