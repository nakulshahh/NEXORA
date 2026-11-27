# Security

Please report vulnerabilities privately through GitHub's "Report a vulnerability" (Security tab) rather than a public issue.
Design decisions and known gaps are documented in `docs/adr/0002-auth-design.md`.

Never commit secrets. `.env*` files are git-ignored (only `*.example` files are tracked) and CI runs `scripts/check-secrets.mjs`.
