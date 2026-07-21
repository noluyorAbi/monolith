# Security

## Reporting

Open a [private security advisory](https://github.com/noluyorAbi/monolith/security/advisories/new).
Please do not open a public issue for anything exploitable.

## What this project touches

It reads GitHub's public contributions calendar for a handle you type. There is
no account, no sign-in, no upload, and nothing is stored about you: a request
comes in, a mesh is built, a file goes out.

`GITHUB_TOKEN` is optional and server-side only. If you set one, it is used for
the GraphQL API and never reaches the browser.
