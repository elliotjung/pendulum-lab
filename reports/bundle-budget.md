# Bundle Budget

Status: **PASS**

| Delivery role | Actual KiB | Budget KiB | Usage | Status |
| --- | ---: | ---: | ---: | :---: |
| initial JS raw | 308.7 | 760.0 | 40.6% | PASS |
| initial JS gzip | 100.4 | 210.0 | 47.8% | PASS |
| initial JS brotli | 81.6 | 180.0 | 45.3% | PASS |
| largest non-initial JS raw | 379.1 | 520.0 | 72.9% | PASS |
| largest non-initial JS gzip | 118.6 | 135.0 | 87.9% | PASS |
| largest non-initial JS brotli | 96.3 | 115.0 | 83.7% | PASS |
| initial CSS raw | 102.0 | 140.0 | 72.9% | PASS |
| initial CSS gzip | 18.8 | 32.0 | 58.6% | PASS |
| initial CSS brotli | 16.0 | 26.0 | 61.5% | PASS |
| standalone HTML raw | 1434.1 | 1450.0 | 98.9% | PASS |
| standalone HTML gzip | 434.7 | 435.0 | 99.9% | PASS |
| standalone HTML brotli | 339.2 | 360.0 | 94.2% | PASS |

## Non-initial JavaScript total

- Raw: 1220.4 KiB
- Gzip: 396.3 KiB
- Brotli: 335.9 KiB

## Standalone 15% headroom policy

- Status: **ACCEPTED EXCEPTION**
- Decision record: `documents/adr/0003-standalone-budget-headroom.md`
- Raw, gzip, and Brotli are all evaluated; an accepted exception is not reported as target compliance.
- Exact attribution: `reports/standalone-byte-attribution.json` and `.md`.

This report is deterministic for a fixed build: it intentionally contains no timestamp or runner-specific path.
