# Artifact Policy

This repository intentionally keeps a small set of generated artifacts because
the project is both an application and a reproducible research portfolio. The
rule is: track generated files only when they are a user-facing release artifact
or durable evidence for a README claim.

## Source Of Truth

- `src/`, `app.html`, `css/`, `scripts/`, `tests/`, `e2e/`, and config
  files are edited by hand and reviewed as source.
- `index.html` at the project root is the generated portable single-file build.
  Regenerate it with `npm run build:standalone`; do not hand-edit it.
- Root worker files such as `chaos.worker.js` and `expansion.worker.js` are
  generated compatibility assets for the portable build path. They should change
  only as a consequence of the build scripts.

## Tracked Evidence

- `reports/*.md` and selected `reports/*.json` files are tracked when README,
  paper, or portfolio claims cite them directly.
- `paper/index.html` and `paper/paper.pdf` are tracked portfolio artifacts and
  should be regenerated through `npm run paper:build`.
- Portfolio summaries under `docs/` may be tracked when they are intended for
  review outside the dev server.

## Ignored Build Output

- `dist/`, `standalone/`, `dist-lib/`, `docs/api/`, `reports/playwright/`,
  `reports/coverage/`, `reports/mutation/`, `test-results/`, and
  `reports/vitest-results.json` are transient outputs.
- Visual-regression snapshots should be committed only after an intentional
  `npx playwright test --update-snapshots` review.

## Release Checklist

1. Run `npm run verify`, `npm run test:coverage`, `npm run build`,
   `npm run build:standalone`, and `npm run budget`.
2. Regenerate claim evidence intentionally (`npm run reports`,
   `npm run reproduce`, `npm run paper:build`) only when the corresponding
   claims changed.
3. Review generated-file diffs separately from source diffs.
