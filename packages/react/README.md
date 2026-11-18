# @pagesignal/react

MIT-licensed PageSignal Community integration.

[Full documentation](https://page-signal.vercel.app/docs#react-package) · [API reference](https://page-signal.vercel.app/docs#api-extract-one-page) · [GitHub](https://github.com/akhi-ninja/page-signal)

Embed the existing workspace in React 18 or 19. This package is an iframe wrapper, not a native upload component or a backend.

```sh
npm install @pagesignal/react react react-dom
```

```jsx
import { PageSignalWorkspace } from '@pagesignal/react';

export default function Documents() {
  return <PageSignalWorkspace
    src="/pagesignal/"
    title="Document extraction"
    height="850px"
    className="document-workspace"
  />;
}
```

Host or reverse-proxy the Community workspace at /pagesignal/ on your app's origin. Map /pagesignal/app.js, /pagesignal/engine.js, and /pagesignal/style.css to the corresponding Community assets, and map /api/ai/* to the Community API. Account deployments must also proxy /api/auth/* and /account.js, preserving cookies and Origin. These API paths are absolute in the bundled UI. The component accepts src, title, height (CSS string), and className. src must be a same-origin path, not an external URL. In Next.js, use it from a client component.

Authenticate users in your application. A server-side proxy can attach the Community service token after checking the session; do not expose it as an iframe prop. No result callbacks or document events are exported; use the workspace's Export JSON button. Programmatic extraction uses your backend and the SDK or core package. Your frame-src/frame-ancestors policies must allow the same-origin workspace.

## Input, output, and limits

The iframe uses the workspace upload limits: 10 files per batch, 30 MiB per file, 100 MiB total, and 40 pages per PDF. Original files and results live in the tab; export before closing. With AI enabled, page images and text are sent through the server to OpenAI.

## Errors

The iframe reports upload and provider errors within the workspace. There are no result events or callbacks.

## License

MIT. Retain the included license and copyright notices.
