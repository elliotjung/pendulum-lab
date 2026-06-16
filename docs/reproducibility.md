# Reproducing the validation ladder

Most of the project is pure TypeScript and reproduces with `npm install && npm
test`. Two claims in the README are deliberately checked against **external**
tools — independent re-derivations the engine cannot mark its own homework on:

| Claim | Script | External reference |
|---|---|---|
| RHS matches a symbolic Euler–Lagrange derivation (~1e-14) | `npm run validate:sympy` | SymPy |
| Trajectories match an independent DOP853 integration | `npm run validate:cross` | NumPy + SciPy `solve_ivp` |

These need Python. To make them reproduce on any machine, the Python references
are pinned.

## Option A — local Python (pinned)

```bash
python -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
npm run validate:sympy
npm run validate:cross
```

`requirements.txt` pins `numpy==1.26.4`, `scipy==1.13.1`, `sympy==1.12`
(tested with CPython 3.11/3.12). The scripts read a JSON job on stdin and write
JSON reference values to stdout; the TypeScript side compares against them and
writes the reports under `reports/`.

## Option B — Docker (Node + Python in one image)

If you don't want to install Python locally, the `Dockerfile` bundles pinned
Node and Python:

```bash
docker build -t pendulum-lab .
docker run --rm pendulum-lab              # validate:sympy + validate:cross + unit tests
docker run --rm pendulum-lab npm test     # or any individual script
```

This is the gap-closing step for *Tier-1* reproducibility: the claims table is
no longer "works if you happen to have the right SciPy" — a reviewer gets the
same reference numbers from a clean container.

## What still has no external dependency

Everything else — the 600+ unit tests, the convergence-order self-checks, the
double-double extended-precision reference, the literature anchors, and the
chaos-diagnostic cross-validations — runs from `npm test` alone with no Python,
no network, and no GPU.
