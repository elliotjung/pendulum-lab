# Standalone byte attribution

Artifact: `standalone/index.html`

SHA-256: `f9d32207e0316d72e7dbc5bd791f07912fd948a21665123986037544655f4cf3`

## Exact standalone HTML partition

| Payload | Raw KiB | Isolated gzip KiB | Isolated Brotli KiB | Raw share |
| --- | ---: | ---: | ---: | ---: |
| HTML markup and static copy | 56.4 | 12.8 | 10.8 | 3.9% |
| inlined application JavaScript | 1275.8 | 403.1 | 314.7 | 89.0% |
| inlined application styles | 101.8 | 18.7 | 15.9 | 7.1% |

Raw bytes add exactly to the artifact. Per-part compressed sizes are isolated estimates; the whole-file compressor shares a dictionary across parts.

## Functional module proxy

| Role in modular build | Raw KiB | Gzip KiB | Brotli KiB |
| --- | ---: | ---: | ---: |
| research workbench | 392.3 | 123.4 | 100.5 |
| initial workbench shell | 321.6 | 105.2 | 85.7 |
| chaos diagnostics and worker | 261.6 | 77.7 | 66.8 |
| other lazy/runtime chunks | 170.7 | 63.3 | 56.3 |
| specialized analysis panels | 134.9 | 44.7 | 39.1 |
| application styles | 107.7 | 20.5 | 17.5 |
| validation surface | 89.2 | 29.9 | 23.3 |
| physics kernels | 76.6 | 24.2 | 21.1 |
| theory surface | 48.8 | 16.4 | 13.9 |
| worker runtime | 33.4 | 11.9 | 10.7 |

> This proxy identifies functional contributors but is not additive to standalone HTML: single-file bundling changes chunk boundaries and compression dictionaries.
