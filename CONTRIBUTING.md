# Contributing to PageSignal

Bug fixes, documentation improvements, and examples are welcome. For a larger feature or a change to a public API or package, open an issue first so we can agree on the scope.

## Set up your fork

1. Fork [PageSignal](https://github.com/akhi-ninja/page-signal), clone your fork, and create a branch from the upstream `development` branch.
2. Use Node.js 24 and run `npm ci --ignore-scripts` from the repository root.
3. Open a pull request against `akhi-ninja/page-signal:development`. Link the related issue if there is one and describe what changed and how you verified it.

See the [README](README.md) for local workspace and API setup. Keep API keys and other credentials in your local environment.

## Verify your changes

Run `npm test` before opening your PR. Run the additional checks that match your change.

| Change | Commands |
| --- | --- |
| README or generated documentation | `npm run docs:build`, then `npm run docs:check` |
| Workspace stylesheet | `npm run styles:build`, then `npm run styles:check` |
| Package exports, build, or distribution | `npm run pack:packages` |
| Release notes or release metadata | `npm run releases:build`, then `npm run releases:check` |

Include updated generated files when their source changes. For fixes, add a regression test where practical. For changes to a public interface, describe compatibility or migration implications in the PR.

## Report a bug

Open a [GitHub issue](https://github.com/akhi-ninja/page-signal/issues/new) with the affected version or commit, reproduction steps, and expected and actual results. Include the browser, runtime, or package version when relevant.

Use synthetic documents or fully redact sample PDFs, screenshots, logs, and extracted JSON before sharing them. Keep real customer documents, personal information, credentials, and access tokens out of public issues and pull requests.
