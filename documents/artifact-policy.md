# Artifact Policy

This repository intentionally keeps a small set of generated artifacts because
the project is both an application and a reproducible research portfolio. The
rule is: track generated files only when they are a user-facing release artifact
or durable evidence for a README claim.

## Source Of Truth

- `src/`, `app.html`, `css/`, `scripts/`, `tests/`, `e2e/`, and config
  files are edited by hand and reviewed as source.
- `standalone/index.html` and its worker siblings are release-only generated
  output. The repository tracks `standalone-manifest.json` (file sizes and
  SHA-256 hashes), not the ~850 KB HTML/worker blobs. Regenerate with
  `npm run build:standalone && npm run standalone:manifest` and review the hash
  diff; releases attach both the direct HTML and a complete ZIP.

## Tracked Evidence

- `reports/*.md` and selected `reports/*.json` files are tracked when README,
  paper, or portfolio claims cite them directly.
- `paper/index.html` and `paper/paper.pdf` are tracked portfolio artifacts and
  should be regenerated through `npm run paper:build`.
- `reports/portfolio-korean.pdf` and its validation JSON are tracked submission
  artifacts generated from `documents/portfolio-korean.md` by
  `npm run release:package`. Poppler page PNGs are temporary visual-review files
  under `tmp/pdfs/` and are not committed.
- Portfolio summaries under `documents/` may be tracked when they are intended for
  review outside the dev server.
- External reference claims should cite `documents/reference-manifest.md`, including
  runtime pins, dependency pins, and source-file checksums.

## Ignored Build Output

- `dist/`, `standalone/`, `dist-lib/`, `documents/api/`, `reports/playwright/`,
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
3. Run `npm run audit:mojibake` when public-facing source or docs change.
4. Review generated-file diffs separately from source diffs.
