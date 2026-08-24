# Visual Baseline Promotion

Visual snapshots are operating-system-specific. Complete Chromium and
mobile-Chrome baseline sets are committed for Windows, Linux, and macOS. Every
platform image must be regenerated on its matching native GitHub runner rather
than copied or renamed from another operating system.

## Promotion procedure

1. Run **Actions -> Visual Baselines -> Run workflow**.
2. Leave `create_pr` enabled. The matrix regenerates Chromium and mobile-Chrome
   snapshots on native Ubuntu, Windows, and macOS runners, checks that all six
   expected PNGs per platform exist with valid PNG/IHDR headers, and reruns the
   visual suite without update mode.
3. Download the platform artifacts and review every image. Check
   text wrapping, focus indicators, clipping, and whether the masked canvases
   hide only simulation pixels.
4. Review and merge the workflow-created PR only if the visual change is
   intentional. Do not accept a large diff merely by increasing Playwright's
   pixel threshold.

Mainline enforces complete-set contracts for `linux`, `win32`, and `darwin`; a
partial platform promotion fails rather than silently reducing coverage. The
workflow artifact remains available when `create_pr` is disabled, but that mode
does not replace reviewed, committed baselines.
