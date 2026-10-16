# M6 Browser UAT

Run these tests only against isolated synthetic M6 staging data. The safety config rejects production-looking targets and non-synthetic applicant identifiers.

1. Run `npm ci` in this directory and `npm run test:safety` before browser tests.
2. With the protected rootless staging environment prepared, run `./run-rootless-container.sh` from this directory. Pass a spec name to limit a run, such as `./run-rootless-container.sh api-security-closure.spec.mjs`.
3. Run the local PDF audit separately with `M6_UAT_RECEIPT_PDF_PATH=<path-to-synthetic-receipt.pdf> node --test pdf-content-audit.test.mjs`. The file must be a receipt from the isolated staging fixture; the test fails if no path is supplied.

Do not commit environment files, downloaded receipts, Playwright artifacts, or staging runtime data.
