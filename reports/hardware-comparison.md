# Hardware Comparison: theory vs tracked measurement

Generated: 2026-07-10T09:25:20.818Z

Dataset: `data/experimental/double-pendulum-tracker.csv` (361 samples over 6.00 s)

Provenance: synthetic-camera-emulation (synthetic camera emulation - not real footage yet)

Fit: **cost-converged** in 5 iterations (0.1 s); angle RMSE 5.87 mrad (0.336 deg).

| parameter | estimated | 1-sigma | nominal | rel. error | within 2-sigma |
|---|---:|---:|---:|---:|---|
| l1 | 0.31978 | 1.05e-3 | 0.32000 | -0.069% | yes |
| l2 | 0.24047 | 6.92e-4 | 0.24000 | 0.197% | yes |
| g | 9.81123 | 2.41e-2 | 9.79900 | 0.125% | yes |

## Reproduce

```bash
npm run fixture:hardware   # regenerate the seeded fixture (or drop in a real tracked CSV)
npm run compare:hardware
```

Chapter: `docs/hardware-validation.md`.

