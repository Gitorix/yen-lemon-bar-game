# Security policy

This is a static, client-side game hosted on GitHub Pages. It has no backend,
API credentials, login, payment processing, analytics, or external runtime
dependencies. Gameplay and audio are computed on the player's device.

## Credential handling

- Never add API keys, access tokens, private keys, or credentials to source,
  images, Actions logs, generated files, or frontend environment variables.
- Anything served to a browser is public. `VITE_*`, minification, encoding,
  and `.gitignore` do not hide a key embedded in an existing tracked file.
- The game needs no Actions secrets. Deployment uses a short-lived,
  GitHub-issued token and Pages OIDC, scoped to the deployment job.
- If an exposure is detected, immediately revoke/rotate the credential with
  its issuer, remove it from source and public artifacts, and investigate use.
  Deleting a file or rewriting history alone does not revoke a stolen key.
- Report vulnerabilities through this repository's **Security → Report a
  vulnerability** when available. Never paste a secret into a public issue.

## Free automated protections

- GitHub Secret scanning and push protection for the public repository.
- Gitleaks CLI checks full reachable Git history and the working directory;
  findings are redacted in public logs. A custom rule covers Sites source tokens.
- Local pre-commit/pre-push hooks fail closed if the scanner is missing.
- Pages publication waits for the secret check and the allowlisted build.
- CodeQL checks JavaScript and Actions on pushes, PRs, and weekly.
- Dependabot checks SHA-pinned GitHub Actions for updates weekly.
- Workflow permissions default to none; only publishing gets Pages/OIDC write.
  Checkout does not persist a Git credential. No `pull_request_target` workflow
  runs with untrusted code and privileged credentials.
- Only the explicit list in `scripts/build.mjs` can enter `dist/`. Symlinks,
  unexpected artifacts, inline handlers, and network APIs in the game are rejected.
- CSP permits local scripts/styles/images, blocks API connections and frames,
  and disallows inline/eval scripts. SRI verifies the built script/stylesheet.
  Referrers are suppressed. GitHub Pages enforces HTTPS.

## Development

Requires Node.js 22+ and Git. No npm packages are installed.

```sh
node scripts/install-security-scanner.mjs
git config core.hooksPath .githooks
node scripts/check-security.mjs
node scripts/build.mjs
node --test tests/security.test.mjs
```

The scanner installer pins its version and verifies the upstream SHA-256 before
extracting/running it. Review scanner upgrades and refresh the pinned checksums.
The official Gitleaks CLI is MIT-licensed; no paid Gitleaks Action is used.

## Scope and limits

The 2026-10-24 audit found no detected secrets in the 4 reachable commits,
working tree, public artifact, or GitHub secret-scanning alerts. Pattern scanners
cannot prove that every possible secret is absent. Local hooks can be bypassed;
GitHub push protection and the CI gate provide additional checks.

GitHub Pages does not provide per-project custom HTTP response headers. CSP is
therefore supplied by HTML meta; `frame-ancestors` and `X-Frame-Options` cannot be
enforced via meta. No fake `_headers` configuration is shipped. The game has no
authenticated actions or sensitive data; changing hosting just for headers is
not necessary here. Use a server that supports response headers if a backend or
credentials are introduced, and keep all provider keys on that server.

Public source code and images are intentionally downloadable. This policy does
not audit other repositories, the owner's account/2FA, previously deleted GitHub
objects, or other applications served on localhost.
