# @pagesignal/react
MIT, prerelease 0.1.0. Embed the Community workspace using a React iframe wrapper.

    import { PageSignalWorkspace } from '@pagesignal/react';
    <PageSignalWorkspace src="/pagesignal/" height="850px" />

Serve the Community UI assets at /pagesignal/ and proxy /api/ai requests to its server.
Your server proxy supplies the service bearer token after authenticating the visitor.
The React component takes a same-origin path and never receives provider or service secrets.
Download JSON in the embedded workspace. Programmatic extraction uses the server-side SDK.
A native React field editor and result events are planned.
