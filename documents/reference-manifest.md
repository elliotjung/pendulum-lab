# External Reference Manifest

Generated: 2026-06-16

This manifest records the external reference implementations used to support
validation claims. A row marked "needs pinning" is useful for comparison work
but should not be cited as fully reproducible evidence until its runtime and
dependency graph are locked.

| Reference | Runtime pin | Dependency pin | Tracked artifact | SHA-256 | Status |
| --- | --- | --- | --- | --- | --- |
| SciPy DOP853 reference | CI Python runtime | `requirements.txt` pins `numpy==1.26.4`, `scipy==1.13.1` | `scripts/scipy_reference.py` | `ecc5a16ec06c815fba77c559a1e5d2e8ed1ac5e14d45de24c772cd929d661fc9` | pinned |
| SymPy analytic reference | CI Python runtime | `requirements.txt` pins `sympy==1.12` | `scripts/sympy_reference.py` | `8b1e5ffb97c256cd498755c099982cb9703384f03b2911f05315da3f6a962c88` | pinned |
| Julia OrdinaryDiffEq reference | Julia `1.10` in CI | `julia/Project.toml` (`e76aaa00c320f463e3dc2b33923ea23b882268850d06a88e9cc30ce4d0243e1d`) + `julia/Manifest.toml` (`3e5a849b35d2eb666c659cc18bdcbd462d975b3459ca1d5488b9c4fd393b3af3`); CI runs `Pkg.instantiate()` with `--project=julia` | `scripts/julia_reference.jl` | `41cbe18bcc4fd1a90e9ee010d3522198c00e5b2e28baaa65a14daba288fc2d0d` | pinned |
| MATLAB reference | Not present | Not present | No MATLAB reference artifact is tracked | n/a | not implemented |

## Hardening Checklist

1. Record the exact Python runtime used by CI in the generated validation
   report, not only the package versions.
2. If MATLAB validation is added, track the script, MATLAB release, toolbox
   list, and file checksums in this manifest before making public claims.
