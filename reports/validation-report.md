# Pendulum Lab Validation Report

Generated: 2026-06-10T10:17:34.456Z
Overall: PASS

| Test | Status | Measured | Threshold |
|---|---|---:|---|
| energy-drift-rk4-double | PASS | 6.452e-16 | < 1e-5 |
| replay-determinism-rk4 | PASS | identical | bitwise-equivalent string serialization |
| json-import-rejects-non-finite | PASS | state contains non-finite or extreme values | reject |
| dt-halving-rk4-double | PASS | 4.783e-10 | < 1e-6 |
| canonical-midpoint-residual | PASS | 1.547e-11 in 4 iterations | < 1e-8 |
