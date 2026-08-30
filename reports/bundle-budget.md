# Bundle Budget

Status: **PASS**

| Delivery role | Actual KiB | Budget KiB | Usage | Status |
| --- | ---: | ---: | ---: | :---: |
| initial JS raw | 301.0 | 760.0 | 39.6% | PASS |
| initial JS gzip | 98.2 | 210.0 | 46.7% | PASS |
| initial JS brotli | 79.7 | 180.0 | 44.3% | PASS |
| largest non-initial JS raw | 379.2 | 520.0 | 72.9% | PASS |
| largest non-initial JS gzip | 118.6 | 135.0 | 87.9% | PASS |
| largest non-initial JS brotli | 96.3 | 115.0 | 83.7% | PASS |
| initial CSS raw | 110.5 | 140.0 | 79.0% | PASS |
| initial CSS gzip | 20.3 | 32.0 | 63.4% | PASS |
| initial CSS brotli | 17.1 | 26.0 | 65.6% | PASS |
| standalone HTML raw | 1435.8 | 1450.0 | 99.0% | PASS |
| standalone HTML gzip | 434.2 | 435.0 | 99.8% | PASS |
| standalone HTML brotli | 338.6 | 360.0 | 94.0% | PASS |

## Non-initial JavaScript total

- Raw: 1220.5 KiB
- Gzip: 396.3 KiB
- Brotli: 335.8 KiB

## Standalone 15% headroom policy

- Status: **ACCEPTED EXCEPTION**
- Decision record: `documents/adr/0003-standalone-budget-headroom.md`
- Raw, gzip, and Brotli are all evaluated; an accepted exception is not reported as target compliance.
- Exact attribution: `reports/standalone-byte-attribution.json` and `.md`.

This report is deterministic for a fixed build: it intentionally contains no timestamp or runner-specific path.
