# Standalone byte attribution

Artifact: `standalone/index.html`

SHA-256: `3b0edd3e09d973446ad69f9f1a4a5e7cf0e08e5abc24ae59e237a675c49db6b4`

## Exact standalone HTML partition

| Payload | Raw KiB | Isolated gzip KiB | Isolated Brotli KiB | Raw share |
| --- | ---: | ---: | ---: | ---: |
| HTML markup and static copy | 57.2 | 13.0 | 11.0 | 4.0% |
| inlined application JavaScript | 1268.2 | 400.8 | 312.9 | 88.3% |
| inlined application styles | 110.4 | 20.2 | 17.0 | 7.7% |

Raw bytes add exactly to the artifact. Per-part compressed sizes are isolated estimates; the whole-file compressor shares a dictionary across parts.

## Functional module proxy

| Role in modular build | Raw KiB | Gzip KiB | Brotli KiB |
| --- | ---: | ---: | ---: |
| research workbench | 392.3 | 123.4 | 100.5 |
| initial workbench shell | 314.0 | 102.9 | 83.7 |
| chaos diagnostics and worker | 261.6 | 77.7 | 66.8 |
| other lazy/runtime chunks | 170.7 | 63.3 | 56.4 |
| specialized analysis panels | 134.9 | 44.7 | 39.1 |
| application styles | 116.3 | 22.1 | 18.6 |
| validation surface | 89.2 | 29.9 | 23.3 |
| physics kernels | 76.6 | 24.2 | 21.1 |
| theory surface | 48.8 | 16.4 | 13.9 |
| worker runtime | 33.4 | 11.9 | 10.7 |

> This proxy identifies functional contributors but is not additive to standalone HTML: single-file bundling changes chunk boundaries and compression dictionaries.
