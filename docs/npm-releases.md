# npm releases

GitHub is the release source. Vercel deploys the web application separately.

## One-time npm setup

For each of `@pagesignal/core`, `@pagesignal/sdk`, and `@pagesignal/react`, open
its npm package Settings and add a GitHub Actions trusted publisher:

| Setting | Value |
| --- | --- |
| Organization or user | `akhi-ninja` |
| Repository | `page-signal` |
| Workflow filename | `publish.yml` |
| Environment | Leave empty |
| Allowed action | Allow `npm publish` |

No npm token or OpenAI key is needed in GitHub Actions. Configure all three
packages before creating a release. npm may require account verification.
Official guide: https://docs.npmjs.com/trusted-publishers/

## Release process

1. Bump all three `packages/*/package.json` versions together, for example to
   `0.1.1`. Existing npm versions cannot be overwritten.
2. Commit to `development`, open a PR to `main`, and let Package checks pass.
3. Merge into `main`.
4. Create and publish a GitHub release from `main`, tagged with exactly the
   package version prefixed by `v` (for example `v0.1.1`).
5. Watch Actions → Publish npm packages and check the npm package pages.

The workflow uses GitHub-hosted Node 24 and npm OIDC trusted publishing with
provenance. It tests and packs before publishing, rejects mismatched release
tags and commits outside main, and skips prereleases. It does not install
application dependencies: current tests and packaging use Node built-ins only.

Package checks also run on pushes and PRs to development and main. Release
publishing is serialized. If one package fails after another succeeds, fix the
registry/trust issue and rerun the same workflow: existing versions are skipped.
A successful submission may take time to appear on the public npm registry.

The first 0.1.0 packages were submitted manually. Do not create a 0.1.0 release
to republish them; use the next version after this workflow is merged.
