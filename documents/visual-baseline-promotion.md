# Visual Baseline Promotion

Visual snapshots are operating-system-specific. Complete Chromium and
mobile-Chrome baseline sets are committed for Windows, Linux, and macOS. Every
platform image must be regenerated on its matching native GitHub runner rather
than copied or renamed from another operating system.

## Promotion procedure

1. Run **Actions -> Visual Baselines -> Run workflow**.
2. Keep the default `review-artifact` mode. The matrix regenerates Chromium and mobile-Chrome
   snapshots on native Ubuntu, Windows, and macOS runners, checks that all six
   expected PNGs per platform exist with valid PNG/IHDR headers, fingerprints
   the runner image, Playwright/Chromium binary, native fonts, locale, viewport,
   DPI/device scale, and exact PNG bytes, then reruns the visual suite without
   update mode.
3. Download `visual-baseline-review-<run id>` and review every image. Check
   text wrapping, focus indicators, clipping, and whether the masked canvases
   hide only simulation pixels. Compare each `visual-baseline-metadata/*.json`
   fingerprint with the prior authority environment.
4. Apply the reviewed binary patch from the repository root, run the three
   platform contract commands shown below, and commit. If repository policy
   permits Actions-created PRs, explicitly select `pull-request`; only that
   job receives repository write permission.

```bash
node scripts/check-visual-baselines.mjs --platform=linux --projects=chromium,mobile-chrome --require-metadata
node scripts/check-visual-baselines.mjs --platform=win32 --projects=chromium,mobile-chrome --require-metadata
node scripts/check-visual-baselines.mjs --platform=darwin --projects=chromium,mobile-chrome --require-metadata
```

The committed hosted-runner baseline is authoritative. A local screenshot is a
diagnostic preview only: even on the same operating system, fonts, browser
revision, DPI, and rasterization can create legitimate pixel differences.

Mainline enforces complete-set contracts for `linux`, `win32`, and `darwin`; a
partial platform promotion fails rather than silently reducing coverage. The
review artifact is the supported path when bot PR creation is disabled; it
ends green with an exact patch instead of reporting a policy restriction as a
visual failure. Existing images without metadata remain explicitly labelled
legacy until the next native promotion; metadata must not be invented locally.
